-- 1. Schema additions
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS payment_reference text;

CREATE UNIQUE INDEX IF NOT EXISTS orders_user_idempotency_key
  ON public.orders (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- 2. Remove client-side insert paths
DROP POLICY IF EXISTS "own orders insert" ON public.orders;
DROP POLICY IF EXISTS "order items insert" ON public.order_items;
REVOKE INSERT ON public.orders FROM anon, authenticated;
REVOKE INSERT ON public.order_items FROM anon, authenticated;
REVOKE UPDATE, DELETE, TRUNCATE ON public.order_items FROM anon, authenticated;
REVOKE DELETE, TRUNCATE ON public.orders FROM anon, authenticated;
REVOKE ALL ON public.orders FROM anon;
REVOKE ALL ON public.order_items FROM anon;
GRANT SELECT, UPDATE ON public.orders TO authenticated;
GRANT SELECT ON public.order_items TO authenticated;
GRANT ALL ON public.orders TO service_role;
GRANT ALL ON public.order_items TO service_role;

-- 3. Guard sensitive columns against browser updates
CREATE OR REPLACE FUNCTION public.protect_order_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE actor uuid := auth.uid();
BEGIN
  -- actor IS NULL => trusted server context (service_role / webhook / definer)
  IF actor IS NULL THEN RETURN NEW; END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.order_number IS DISTINCT FROM OLD.order_number
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.subtotal_incl_vat IS DISTINCT FROM OLD.subtotal_incl_vat
     OR NEW.vat_amount IS DISTINCT FROM OLD.vat_amount
     OR NEW.delivery_fee IS DISTINCT FROM OLD.delivery_fee
     OR NEW.total_incl_vat IS DISTINCT FROM OLD.total_incl_vat
     OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key THEN
    RAISE EXCEPTION 'Order identity and monetary fields cannot be modified';
  END IF;

  IF (NEW.payment_status IS DISTINCT FROM OLD.payment_status
      OR NEW.payment_reference IS DISTINCT FROM OLD.payment_reference)
     AND NOT public.is_admin(actor) THEN
    RAISE EXCEPTION 'Only administrators or a verified payment webhook may change payment status';
  END IF;

  IF NOT public.is_staff(actor) THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.admin_notes IS DISTINCT FROM OLD.admin_notes
       OR NEW.assigned_to IS DISTINCT FROM OLD.assigned_to
       OR NEW.pipeline_stage IS DISTINCT FROM OLD.pipeline_stage THEN
      RAISE EXCEPTION 'Only staff may change order workflow fields';
    END IF;
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS orders_protect_fields ON public.orders;
CREATE TRIGGER orders_protect_fields
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.protect_order_fields();

-- 4. Atomic, server-priced order creation
CREATE OR REPLACE FUNCTION public.place_order(
  _items jsonb,
  _contact_name text,
  _contact_email text,
  _contact_phone text,
  _delivery_address jsonb,
  _delivery_method text,
  _customer_notes text,
  _idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
  existing public.orders%ROWTYPE;
  new_order public.orders%ROWTYPE;
  item jsonb;
  pid uuid;
  qty int;
  prod public.products%ROWTYPE;
  v_subtotal numeric(12,2) := 0;
  v_delivery numeric(12,2) := 0;
  v_vat numeric(12,2);
  v_method text;
  line_total numeric(12,2);
  item_count int;
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to place an order';
  END IF;

  IF _idempotency_key IS NULL OR length(_idempotency_key) < 8 THEN
    RAISE EXCEPTION 'A valid submission key is required';
  END IF;

  SELECT * INTO existing FROM public.orders
    WHERE user_id = actor AND idempotency_key = _idempotency_key;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'id', existing.id, 'order_number', existing.order_number,
      'subtotal_incl_vat', existing.subtotal_incl_vat, 'vat_amount', existing.vat_amount,
      'delivery_fee', existing.delivery_fee, 'total_incl_vat', existing.total_incl_vat,
      'duplicate', true);
  END IF;

  IF _items IS NULL OR jsonb_typeof(_items) <> 'array' THEN
    RAISE EXCEPTION 'No items submitted';
  END IF;
  item_count := jsonb_array_length(_items);
  IF item_count < 1 OR item_count > 50 THEN
    RAISE EXCEPTION 'Order must contain between 1 and 50 line items';
  END IF;

  v_method := CASE WHEN _delivery_method = 'collection' THEN 'collection' ELSE 'courier' END;

  INSERT INTO public.orders (
    user_id, contact_name, contact_email, contact_phone, delivery_address,
    delivery_method, customer_notes, idempotency_key,
    subtotal_incl_vat, vat_amount, delivery_fee, total_incl_vat,
    payment_method, payment_status, status
  ) VALUES (
    actor,
    left(btrim(_contact_name), 100),
    left(btrim(_contact_email), 255),
    left(btrim(coalesce(_contact_phone, '')), 20),
    CASE WHEN v_method = 'collection' THEN NULL ELSE _delivery_address END,
    v_method,
    left(coalesce(_customer_notes, ''), 1000),
    _idempotency_key,
    0, 0, 0, 0,
    'request', 'unpaid', 'new'
  ) RETURNING * INTO new_order;

  FOR item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    BEGIN
      pid := (item->>'product_id')::uuid;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'Invalid product reference in cart';
    END;

    qty := floor(coalesce((item->>'quantity')::numeric, 0))::int;
    IF qty IS NULL OR qty < 1 OR qty > 99 THEN
      RAISE EXCEPTION 'Invalid quantity for product %', pid;
    END IF;

    SELECT * INTO prod FROM public.products WHERE id = pid;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product % is no longer available', pid;
    END IF;
    IF NOT prod.is_published OR prod.is_discontinued THEN
      RAISE EXCEPTION 'Product % is not available for purchase', prod.name;
    END IF;
    IF prod.stock_status = 'out_of_stock' THEN
      RAISE EXCEPTION 'Product % is out of stock', prod.name;
    END IF;
    IF prod.selling_price_incl_vat IS NULL OR prod.selling_price_incl_vat <= 0 THEN
      RAISE EXCEPTION 'Product % is not priced for online sale', prod.name;
    END IF;

    line_total := round(prod.selling_price_incl_vat * qty, 2);
    v_subtotal := v_subtotal + line_total;

    INSERT INTO public.order_items (
      order_id, product_id, sku, name, quantity,
      unit_price_incl_vat, line_total_incl_vat
    ) VALUES (
      new_order.id, prod.id, prod.sku, prod.name, qty,
      prod.selling_price_incl_vat, line_total
    );
  END LOOP;

  v_vat := round(v_subtotal - (v_subtotal / 1.15), 2);

  UPDATE public.orders SET
    subtotal_incl_vat = v_subtotal,
    vat_amount = v_vat,
    delivery_fee = v_delivery,
    total_incl_vat = v_subtotal + v_delivery
  WHERE id = new_order.id
  RETURNING * INTO new_order;

  INSERT INTO public.order_status_history (order_id, status, note, changed_by)
  VALUES (new_order.id, 'new', 'Order placed online', actor);

  RETURN jsonb_build_object(
    'id', new_order.id, 'order_number', new_order.order_number,
    'subtotal_incl_vat', new_order.subtotal_incl_vat, 'vat_amount', new_order.vat_amount,
    'delivery_fee', new_order.delivery_fee, 'total_incl_vat', new_order.total_incl_vat,
    'duplicate', false);
END; $$;

REVOKE ALL ON FUNCTION public.place_order(jsonb, text, text, text, jsonb, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.place_order(jsonb, text, text, text, jsonb, text, text, text) TO authenticated, service_role;

-- 5. Future verified gateway webhook entry point (admin / service_role only)
CREATE OR REPLACE FUNCTION public.mark_order_paid(
  _order_id uuid,
  _payment_reference text,
  _payment_method text,
  _amount_incl_vat numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE ord public.orders%ROWTYPE; actor uuid := auth.uid();
BEGIN
  IF actor IS NOT NULL AND NOT public.is_admin(actor) THEN
    RAISE EXCEPTION 'Not authorised to settle payments';
  END IF;

  SELECT * INTO ord FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;

  IF ord.payment_status = 'paid' THEN
    RETURN jsonb_build_object('id', ord.id, 'payment_status', 'paid', 'already_settled', true);
  END IF;

  IF _amount_incl_vat IS NULL OR round(_amount_incl_vat, 2) <> ord.total_incl_vat THEN
    RAISE EXCEPTION 'Settled amount does not match order total';
  END IF;

  UPDATE public.orders SET
    payment_status = 'paid',
    payment_reference = _payment_reference,
    payment_method = coalesce(_payment_method, payment_method),
    status = CASE WHEN status = 'new' THEN 'paid'::order_status ELSE status END
  WHERE id = _order_id RETURNING * INTO ord;

  INSERT INTO public.order_status_history (order_id, status, note, changed_by)
  VALUES (ord.id, ord.status, 'Payment confirmed: ' || coalesce(_payment_reference, 'n/a'), actor);

  RETURN jsonb_build_object('id', ord.id, 'payment_status', ord.payment_status, 'already_settled', false);
END; $$;

REVOKE ALL ON FUNCTION public.mark_order_paid(uuid, text, text, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_order_paid(uuid, text, text, numeric) TO service_role;