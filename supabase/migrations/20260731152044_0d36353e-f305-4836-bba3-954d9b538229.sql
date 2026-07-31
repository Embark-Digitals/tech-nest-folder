-- 1. Inventory mode -------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.inventory_mode AS ENUM ('tracked','supplier_confirmation','unlimited','discontinued');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS inventory_mode public.inventory_mode NOT NULL DEFAULT 'supplier_confirmation';

UPDATE public.products SET inventory_mode = 'discontinued' WHERE is_discontinued;
UPDATE public.products SET inventory_mode = 'tracked' WHERE quantity IS NOT NULL AND NOT is_discontinued;

ALTER TABLE public.products
  ADD CONSTRAINT products_quantity_non_negative CHECK (quantity IS NULL OR quantity >= 0);

-- 2. Payment recording columns --------------------------------------------
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_source text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS payment_confirmed_by uuid,
  ADD COLUMN IF NOT EXISTS payment_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS stock_released boolean NOT NULL DEFAULT false;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_payment_source_valid CHECK (payment_source IN ('none','manual','gateway'));

UPDATE public.orders SET payment_method = 'request_order' WHERE payment_method IS NULL OR payment_method = 'request';

-- 3. place_order: reserve tracked stock atomically -------------------------
CREATE OR REPLACE FUNCTION public.place_order(
  _items jsonb, _contact_name text, _contact_email text, _contact_phone text,
  _delivery_address jsonb, _delivery_method text, _customer_notes text, _idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  actor uuid := auth.uid();
  existing public.orders%ROWTYPE;
  new_order public.orders%ROWTYPE;
  item jsonb; pid uuid; qty int; prod public.products%ROWTYPE;
  v_subtotal numeric(12,2) := 0; v_delivery numeric(12,2) := 0; v_vat numeric(12,2);
  v_method text; line_total numeric(12,2); item_count int;
  resolved jsonb := '[]'::jsonb; e jsonb;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'You must be signed in to place an order'; END IF;
  IF _idempotency_key IS NULL OR length(_idempotency_key) < 8 THEN
    RAISE EXCEPTION 'A valid submission key is required'; END IF;

  SELECT * INTO existing FROM public.orders
    WHERE user_id = actor AND idempotency_key = _idempotency_key;
  IF FOUND THEN
    RETURN jsonb_build_object('id', existing.id, 'order_number', existing.order_number,
      'subtotal_incl_vat', existing.subtotal_incl_vat, 'vat_amount', existing.vat_amount,
      'delivery_fee', existing.delivery_fee, 'total_incl_vat', existing.total_incl_vat,
      'duplicate', true);
  END IF;

  IF _items IS NULL OR jsonb_typeof(_items) <> 'array' THEN RAISE EXCEPTION 'No items submitted'; END IF;
  item_count := jsonb_array_length(_items);
  IF item_count < 1 OR item_count > 50 THEN
    RAISE EXCEPTION 'Order must contain between 1 and 50 line items'; END IF;

  v_method := CASE WHEN _delivery_method = 'collection' THEN 'collection' ELSE 'courier' END;

  FOR item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    BEGIN pid := (item->>'product_id')::uuid;
    EXCEPTION WHEN others THEN RAISE EXCEPTION 'Invalid product reference in cart'; END;

    IF jsonb_typeof(item->'quantity') <> 'number' THEN
      RAISE EXCEPTION 'Invalid quantity for product %', pid; END IF;
    qty := floor((item->>'quantity')::numeric)::int;
    IF qty IS NULL OR qty < 1 OR qty > 99 THEN
      RAISE EXCEPTION 'Invalid quantity for product %', pid; END IF;

    -- row lock serialises concurrent buyers of the same product
    SELECT * INTO prod FROM public.products WHERE id = pid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Product % is no longer available', pid; END IF;
    IF NOT prod.is_published OR prod.is_discontinued THEN
      RAISE EXCEPTION 'Product % is not available for purchase', prod.name; END IF;
    IF prod.inventory_mode = 'discontinued' THEN
      RAISE EXCEPTION 'Product % has been discontinued', prod.name; END IF;
    IF prod.stock_status = 'out_of_stock' THEN
      RAISE EXCEPTION 'Product % is out of stock', prod.name; END IF;
    IF prod.selling_price_incl_vat IS NULL OR prod.selling_price_incl_vat <= 0 THEN
      RAISE EXCEPTION 'Product % is not priced for online sale', prod.name; END IF;
    IF prod.inventory_mode = 'tracked' THEN
      IF coalesce(prod.quantity, 0) < qty THEN
        RAISE EXCEPTION 'Only % unit(s) of % remain in stock', coalesce(prod.quantity,0), prod.name;
      END IF;
    END IF;

    line_total := round(prod.selling_price_incl_vat * qty, 2);
    v_subtotal := v_subtotal + line_total;
    resolved := resolved || jsonb_build_object(
      'product_id', prod.id, 'sku', prod.sku, 'name', prod.name, 'quantity', qty,
      'unit', prod.selling_price_incl_vat, 'line_total', line_total,
      'tracked', prod.inventory_mode = 'tracked');
  END LOOP;

  v_vat := round(v_subtotal - (v_subtotal / 1.15), 2);

  INSERT INTO public.orders (
    user_id, contact_name, contact_email, contact_phone, delivery_address,
    delivery_method, customer_notes, idempotency_key,
    subtotal_incl_vat, vat_amount, delivery_fee, total_incl_vat,
    payment_method, payment_source, payment_status, status
  ) VALUES (
    actor, left(btrim(_contact_name),100), left(btrim(_contact_email),255),
    left(btrim(coalesce(_contact_phone,'')),20),
    CASE WHEN v_method = 'collection' THEN NULL ELSE _delivery_address END,
    v_method, nullif(left(coalesce(_customer_notes,''),1000),''), _idempotency_key,
    v_subtotal, v_vat, v_delivery, v_subtotal + v_delivery,
    'request_order', 'none', 'unpaid', 'new'
  ) RETURNING * INTO new_order;

  INSERT INTO public.order_items (
    order_id, product_id, sku, name, quantity, unit_price_incl_vat, line_total_incl_vat)
  SELECT new_order.id, (e2->>'product_id')::uuid, e2->>'sku', e2->>'name',
         (e2->>'quantity')::int, (e2->>'unit')::numeric, (e2->>'line_total')::numeric
  FROM jsonb_array_elements(resolved) e2;

  -- reserve stock for tracked lines
  FOR e IN SELECT * FROM jsonb_array_elements(resolved) LOOP
    IF (e->>'tracked')::boolean THEN
      UPDATE public.products
        SET quantity = quantity - (e->>'quantity')::int
        WHERE id = (e->>'product_id')::uuid;
    END IF;
  END LOOP;

  INSERT INTO public.order_status_history (order_id, status, note, changed_by)
  VALUES (new_order.id, 'new', 'Order placed online', actor);

  RETURN jsonb_build_object('id', new_order.id, 'order_number', new_order.order_number,
    'subtotal_incl_vat', new_order.subtotal_incl_vat, 'vat_amount', new_order.vat_amount,
    'delivery_fee', new_order.delivery_fee, 'total_incl_vat', new_order.total_incl_vat,
    'duplicate', false);
END; $fn$;

REVOKE ALL ON FUNCTION public.place_order(jsonb,text,text,text,jsonb,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.place_order(jsonb,text,text,text,jsonb,text,text,text) TO authenticated;

-- 4. Stock release helper --------------------------------------------------
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
  UPDATE public.orders SET stock_released = true WHERE id = _order_id;
END; $fn$;
REVOKE ALL ON FUNCTION public.release_order_stock(uuid) FROM PUBLIC, anon, authenticated;

-- 5. Staff status transitions ---------------------------------------------
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

  UPDATE public.orders SET status = _status WHERE id = _order_id RETURNING * INTO ord;

  IF _status IN ('cancelled','refunded') THEN
    PERFORM public.release_order_stock(_order_id);
  END IF;

  INSERT INTO public.order_status_history (order_id, status, note, changed_by)
  VALUES (_order_id, _status, nullif(left(coalesce(_note,''),500),''), actor);

  RETURN jsonb_build_object('id', ord.id, 'status', ord.status, 'changed', true);
END; $fn$;

REVOKE ALL ON FUNCTION public.set_order_status(uuid, public.order_status, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_order_status(uuid, public.order_status, text) TO authenticated;

-- 6. Manual EFT confirmation (admin only) ----------------------------------
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
  IF _amount_incl_vat IS NULL OR round(_amount_incl_vat,2) <> ord.total_incl_vat THEN
    RAISE EXCEPTION 'Settled amount does not match order total';
  END IF;

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

  RETURN jsonb_build_object('id', ord.id, 'payment_status', ord.payment_status,
    'payment_method', ord.payment_method, 'payment_source', ord.payment_source, 'already_settled', false);
END; $fn$;

REVOKE ALL ON FUNCTION public.confirm_manual_eft(uuid, text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_manual_eft(uuid, text, numeric) TO authenticated;

-- 7. Gateway settlement: verified server pathway only ----------------------
CREATE OR REPLACE FUNCTION public.mark_order_paid(_order_id uuid, _payment_reference text, _amount_incl_vat numeric, _payment_method text DEFAULT 'gateway')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE ord public.orders%ROWTYPE;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'Gateway settlement may only be recorded by the verified payment webhook';
  END IF;

  SELECT * INTO ord FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF ord.payment_status = 'paid' THEN
    RETURN jsonb_build_object('id', ord.id, 'payment_status','paid','already_settled', true);
  END IF;
  IF _amount_incl_vat IS NULL OR round(_amount_incl_vat,2) <> ord.total_incl_vat THEN
    RAISE EXCEPTION 'Settled amount does not match order total';
  END IF;

  UPDATE public.orders SET
    payment_status = 'paid',
    payment_method = 'gateway',
    payment_source = 'gateway',
    payment_reference = _payment_reference,
    payment_confirmed_at = now(),
    payment_confirmed_by = NULL,
    status = CASE WHEN status IN ('new','awaiting_payment','stock_confirmed') THEN 'paid'::public.order_status ELSE status END
  WHERE id = _order_id RETURNING * INTO ord;

  INSERT INTO public.order_status_history (order_id, status, note, changed_by)
  VALUES (ord.id, ord.status, 'Gateway settlement ' || coalesce(_payment_reference,'n/a'), NULL);

  RETURN jsonb_build_object('id', ord.id, 'payment_status', ord.payment_status,
    'payment_source', ord.payment_source, 'already_settled', false);
END; $fn$;

REVOKE ALL ON FUNCTION public.mark_order_paid(uuid, text, numeric, text) FROM PUBLIC, anon, authenticated;

-- 8. Tighten direct order updates -----------------------------------------
CREATE OR REPLACE FUNCTION public.protect_order_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE actor uuid := auth.uid();
BEGIN
  IF actor IS NULL THEN RETURN NEW; END IF;

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