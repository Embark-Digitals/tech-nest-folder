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
  resolved jsonb := '[]'::jsonb;
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

  -- Pass 1: validate every product and price it from the live catalogue.
  FOR item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    BEGIN
      pid := (item->>'product_id')::uuid;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'Invalid product reference in cart';
    END;

    IF jsonb_typeof(item->'quantity') <> 'number' THEN
      RAISE EXCEPTION 'Invalid quantity for product %', pid;
    END IF;
    qty := floor((item->>'quantity')::numeric)::int;
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
    resolved := resolved || jsonb_build_object(
      'product_id', prod.id, 'sku', prod.sku, 'name', prod.name, 'quantity', qty,
      'unit', prod.selling_price_incl_vat, 'line_total', line_total);
  END LOOP;

  v_vat := round(v_subtotal - (v_subtotal / 1.15), 2);

  -- Pass 2: write order + items atomically with server-computed money.
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
    nullif(left(coalesce(_customer_notes, ''), 1000), ''),
    _idempotency_key,
    v_subtotal, v_vat, v_delivery, v_subtotal + v_delivery,
    'request', 'unpaid', 'new'
  ) RETURNING * INTO new_order;

  INSERT INTO public.order_items (
    order_id, product_id, sku, name, quantity, unit_price_incl_vat, line_total_incl_vat)
  SELECT new_order.id,
         (e->>'product_id')::uuid, e->>'sku', e->>'name', (e->>'quantity')::int,
         (e->>'unit')::numeric, (e->>'line_total')::numeric
  FROM jsonb_array_elements(resolved) e;

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