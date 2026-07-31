CREATE OR REPLACE FUNCTION public.protect_order_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE actor uuid := auth.uid();
BEGIN
  IF actor IS NULL THEN RETURN NEW; END IF;
  IF coalesce(current_setting('app.order_workflow', true), '') = 'on' THEN RETURN NEW; END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.order_number IS DISTINCT FROM OLD.order_number
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.subtotal_incl_vat IS DISTINCT FROM OLD.subtotal_incl_vat
     OR NEW.vat_amount IS DISTINCT FROM OLD.vat_amount
     OR NEW.delivery_fee IS DISTINCT FROM OLD.delivery_fee
     OR NEW.total_incl_vat IS DISTINCT FROM OLD.total_incl_vat
     OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
     OR NEW.stock_released IS DISTINCT FROM OLD.stock_released THEN
    RAISE EXCEPTION 'Order identity and monetary fields cannot be modified';
  END IF;

  IF NEW.payment_status IS DISTINCT FROM OLD.payment_status
     OR NEW.payment_reference IS DISTINCT FROM OLD.payment_reference
     OR NEW.payment_method IS DISTINCT FROM OLD.payment_method
     OR NEW.payment_source IS DISTINCT FROM OLD.payment_source
     OR NEW.payment_confirmed_by IS DISTINCT FROM OLD.payment_confirmed_by
     OR NEW.payment_confirmed_at IS DISTINCT FROM OLD.payment_confirmed_at THEN
    RAISE EXCEPTION 'Payment fields may only be set by the payment confirmation routines';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Order status must be changed through the status workflow';
  END IF;

  IF NOT public.is_staff(actor) THEN
    IF NEW.admin_notes IS DISTINCT FROM OLD.admin_notes
       OR NEW.assigned_to IS DISTINCT FROM OLD.assigned_to
       OR NEW.pipeline_stage IS DISTINCT FROM OLD.pipeline_stage THEN
      RAISE EXCEPTION 'Only staff may change order workflow fields';
    END IF;
  END IF;

  RETURN NEW;
END; $fn$;

CREATE OR REPLACE FUNCTION public.set_order_status(_order_id uuid, _status public.order_status, _note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  actor uuid := auth.uid();
  ord public.orders%ROWTYPE;
  allowed public.order_status[];
BEGIN
  IF actor IS NULL OR NOT public.is_staff(actor) THEN
    RAISE EXCEPTION 'Only staff may change order status';
  END IF;

  SELECT * INTO ord FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF ord.status = _status THEN
    RETURN jsonb_build_object('id', ord.id, 'status', ord.status, 'changed', false);
  END IF;

  allowed := CASE ord.status
    WHEN 'new' THEN ARRAY['awaiting_stock_confirmation','stock_confirmed','awaiting_payment','cancelled']
    WHEN 'awaiting_stock_confirmation' THEN ARRAY['stock_confirmed','cancelled']
    WHEN 'stock_confirmed' THEN ARRAY['awaiting_payment','processing','cancelled']
    WHEN 'awaiting_payment' THEN ARRAY['paid','cancelled']
    WHEN 'paid' THEN ARRAY['processing','cancelled']
    WHEN 'processing' THEN ARRAY['ready_for_dispatch','cancelled']
    WHEN 'ready_for_dispatch' THEN ARRAY['shipped','cancelled']
    WHEN 'shipped' THEN ARRAY['delivered','cancelled']
    WHEN 'delivered' THEN ARRAY['refunded']
    ELSE ARRAY[]::text[]
  END::public.order_status[];

  IF NOT (_status = ANY (allowed)) THEN
    RAISE EXCEPTION 'Cannot move order from % to %', ord.status, _status;
  END IF;
  IF _status = 'refunded' AND NOT public.is_admin(actor) THEN
    RAISE EXCEPTION 'Only administrators may refund an order';
  END IF;

  PERFORM set_config('app.order_workflow', 'on', true);
  UPDATE public.orders SET status = _status WHERE id = _order_id RETURNING * INTO ord;

  IF _status IN ('cancelled','refunded') THEN
    PERFORM public.release_order_stock(_order_id);
  END IF;

  INSERT INTO public.order_status_history (order_id, status, note, changed_by)
  VALUES (_order_id, _status, nullif(left(coalesce(_note,''),500),''), actor);
  PERFORM set_config('app.order_workflow', 'off', true);

  RETURN jsonb_build_object('id', ord.id, 'status', ord.status, 'changed', true);
END; $fn$;

CREATE OR REPLACE FUNCTION public.release_order_stock(_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE ord public.orders%ROWTYPE;
BEGIN
  SELECT * INTO ord FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND OR ord.stock_released THEN RETURN; END IF;
  UPDATE public.products p
     SET quantity = coalesce(p.quantity,0) + i.quantity
    FROM public.order_items i
   WHERE i.order_id = _order_id AND p.id = i.product_id AND p.inventory_mode = 'tracked';
  PERFORM set_config('app.order_workflow', 'on', true);
  UPDATE public.orders SET stock_released = true WHERE id = _order_id;
END; $fn$;

CREATE OR REPLACE FUNCTION public.confirm_manual_eft(_order_id uuid, _payment_reference text, _amount_incl_vat numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE actor uuid := auth.uid(); ord public.orders%ROWTYPE;
BEGIN
  IF actor IS NULL OR NOT public.is_admin(actor) THEN
    RAISE EXCEPTION 'Only administrators may confirm manual EFT payments';
  END IF;
  IF _payment_reference IS NULL OR length(btrim(_payment_reference)) < 3 THEN
    RAISE EXCEPTION 'A payment reference is required';
  END IF;

  SELECT * INTO ord FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF ord.payment_status = 'paid' THEN
    RETURN jsonb_build_object('id', ord.id, 'payment_status','paid','already_settled', true);
  END IF;
  IF ord.status IN ('cancelled','refunded') THEN
    RAISE EXCEPTION 'Cannot record payment against a % order', ord.status;
  END IF;
  IF _amount_incl_vat IS NULL OR round(_amount_incl_vat,2) <> ord.total_incl_vat THEN
    RAISE EXCEPTION 'Settled amount does not match order total';
  END IF;

  PERFORM set_config('app.order_workflow', 'on', true);
  UPDATE public.orders SET
    payment_status = 'paid',
    payment_method = 'manual_eft',
    payment_source = 'manual',
    payment_reference = btrim(_payment_reference),
    payment_confirmed_by = actor,
    payment_confirmed_at = now(),
    status = CASE WHEN status IN ('new','awaiting_payment','stock_confirmed') THEN 'paid'::public.order_status ELSE status END
  WHERE id = _order_id RETURNING * INTO ord;

  INSERT INTO public.order_status_history (order_id, status, note, changed_by)
  VALUES (ord.id, ord.status, 'Manual EFT confirmed, ref ' || btrim(_payment_reference), actor);
  PERFORM set_config('app.order_workflow', 'off', true);

  RETURN jsonb_build_object('id', ord.id, 'payment_status', ord.payment_status,
    'payment_method', ord.payment_method, 'payment_source', ord.payment_source, 'already_settled', false);
END; $fn$;