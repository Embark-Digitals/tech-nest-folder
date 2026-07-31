-- ============ enums ============
CREATE TYPE public.delivery_class AS ENUM
  ('standard','fragile','oversized','heavy','supplier_confirmation','collection_only');

CREATE TYPE public.postal_rule_action AS ENUM ('include','exclude','override','remote');

ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'ready_for_collection';

-- ============ provinces ============
CREATE TABLE public.shipping_provinces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.shipping_provinces TO anon, authenticated;
GRANT ALL ON public.shipping_provinces TO service_role;
ALTER TABLE public.shipping_provinces ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Provinces are publicly readable" ON public.shipping_provinces FOR SELECT USING (true);
CREATE POLICY "Admins manage provinces" ON public.shipping_provinces FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE TRIGGER trg_shipping_provinces_updated BEFORE UPDATE ON public.shipping_provinces
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ zones ============
CREATE TABLE public.shipping_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  province_code text NOT NULL REFERENCES public.shipping_provinces(code) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT false,
  is_suspended boolean NOT NULL DEFAULT false,
  suspension_note text,
  base_fee numeric(10,2) NOT NULL DEFAULT 0,
  free_delivery_threshold numeric(12,2),
  remote_surcharge numeric(10,2) NOT NULL DEFAULT 0,
  estimate_min_days integer NOT NULL DEFAULT 1,
  estimate_max_days integer NOT NULL DEFAULT 3,
  allowed_delivery_classes public.delivery_class[] NOT NULL
    DEFAULT ARRAY['standard','fragile','oversized','heavy']::public.delivery_class[],
  collection_enabled boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.shipping_zones TO anon, authenticated;
GRANT ALL ON public.shipping_zones TO service_role;
ALTER TABLE public.shipping_zones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Zones are publicly readable" ON public.shipping_zones FOR SELECT USING (true);
CREATE POLICY "Admins manage zones" ON public.shipping_zones FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE TRIGGER trg_shipping_zones_updated BEFORE UPDATE ON public.shipping_zones
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ postal rules ============
CREATE TABLE public.shipping_postal_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id uuid REFERENCES public.shipping_zones(id) ON DELETE CASCADE,
  province_code text REFERENCES public.shipping_provinces(code) ON DELETE CASCADE,
  code_from integer NOT NULL,
  code_to integer NOT NULL,
  action public.postal_rule_action NOT NULL DEFAULT 'include',
  override_fee numeric(10,2),
  surcharge numeric(10,2) NOT NULL DEFAULT 0,
  note text,
  priority integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.shipping_postal_rules TO anon, authenticated;
GRANT ALL ON public.shipping_postal_rules TO service_role;
ALTER TABLE public.shipping_postal_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Postal rules are publicly readable" ON public.shipping_postal_rules FOR SELECT USING (true);
CREATE POLICY "Admins manage postal rules" ON public.shipping_postal_rules FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE TRIGGER trg_shipping_postal_rules_updated BEFORE UPDATE ON public.shipping_postal_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ delivery class surcharges ============
CREATE TABLE public.delivery_class_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_class public.delivery_class NOT NULL UNIQUE,
  label text NOT NULL,
  surcharge numeric(10,2) NOT NULL DEFAULT 0,
  requires_manual_quote boolean NOT NULL DEFAULT false,
  collection_only boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.delivery_class_rules TO anon, authenticated;
GRANT ALL ON public.delivery_class_rules TO service_role;
ALTER TABLE public.delivery_class_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Delivery class rules are publicly readable" ON public.delivery_class_rules FOR SELECT USING (true);
CREATE POLICY "Admins manage delivery class rules" ON public.delivery_class_rules FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE TRIGGER trg_delivery_class_rules_updated BEFORE UPDATE ON public.delivery_class_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ global shipping settings ============
CREATE TABLE public.shipping_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_enabled boolean NOT NULL DEFAULT true,
  collection_address text NOT NULL DEFAULT 'TechNest Collection Point, Gauteng',
  collection_instructions text NOT NULL DEFAULT 'Collection is by appointment once your order is confirmed and paid. Bring your order number and ID.',
  manual_quote_enabled boolean NOT NULL DEFAULT true,
  unsupported_area_message text NOT NULL DEFAULT 'TechNest currently delivers within Gauteng only. You are welcome to collect your order, or send us a delivery enquiry and we will quote you directly.',
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.shipping_settings TO anon, authenticated;
GRANT ALL ON public.shipping_settings TO service_role;
ALTER TABLE public.shipping_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Shipping settings are publicly readable" ON public.shipping_settings FOR SELECT USING (true);
CREATE POLICY "Admins manage shipping settings" ON public.shipping_settings FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE TRIGGER trg_shipping_settings_updated BEFORE UPDATE ON public.shipping_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ out-of-area enquiries ============
CREATE TABLE public.delivery_enquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  contact_name text NOT NULL,
  contact_email text NOT NULL,
  contact_phone text,
  province text NOT NULL,
  city text,
  postal_code text,
  address_line1 text,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  estimated_subtotal_incl_vat numeric(12,2),
  message text,
  status text NOT NULL DEFAULT 'new',
  handled_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.delivery_enquiries TO authenticated;
GRANT ALL ON public.delivery_enquiries TO service_role;
ALTER TABLE public.delivery_enquiries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see their own enquiries" ON public.delivery_enquiries FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY "Users create their own enquiries" ON public.delivery_enquiries FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "Staff update enquiries" ON public.delivery_enquiries FOR UPDATE TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE TRIGGER trg_delivery_enquiries_updated BEFORE UPDATE ON public.delivery_enquiries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ product + order columns ============
ALTER TABLE public.products
  ADD COLUMN delivery_class public.delivery_class NOT NULL DEFAULT 'standard',
  ADD COLUMN delivery_restricted boolean NOT NULL DEFAULT false,
  ADD COLUMN delivery_note text;

ALTER TABLE public.orders
  ADD COLUMN delivery_province text,
  ADD COLUMN delivery_zone_id uuid REFERENCES public.shipping_zones(id),
  ADD COLUMN delivery_zone_name text,
  ADD COLUMN delivery_estimate text,
  ADD COLUMN delivery_surcharges jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN delivery_quote jsonb;

-- ============ seed reference data ============
INSERT INTO public.shipping_provinces (code, name, is_active, sort_order) VALUES
  ('GP','Gauteng', true, 1),
  ('NW','North West', false, 2),
  ('LP','Limpopo', false, 3),
  ('MP','Mpumalanga', false, 4),
  ('FS','Free State', false, 5),
  ('KZN','KwaZulu-Natal', false, 6),
  ('EC','Eastern Cape', false, 7),
  ('WC','Western Cape', false, 8),
  ('NC','Northern Cape', false, 9);

INSERT INTO public.shipping_zones
  (province_code, name, slug, is_active, base_fee, free_delivery_threshold, remote_surcharge,
   estimate_min_days, estimate_max_days, collection_enabled, sort_order) VALUES
  ('GP','Johannesburg','johannesburg', true, 120.00, 5000.00, 90.00, 1, 2, true, 1),
  ('GP','Pretoria / Tshwane','pretoria-tshwane', true, 150.00, 5000.00, 90.00, 1, 3, false, 2),
  ('GP','Ekurhuleni','ekurhuleni', true, 140.00, 5000.00, 90.00, 1, 3, false, 3),
  ('GP','Midrand','midrand', true, 110.00, 5000.00, 90.00, 1, 2, true, 4),
  ('GP','Centurion','centurion', true, 130.00, 5000.00, 90.00, 1, 3, false, 5),
  ('GP','West Rand','west-rand', true, 180.00, 6000.00, 120.00, 2, 4, false, 6),
  ('GP','Sedibeng','sedibeng', true, 200.00, 6000.00, 120.00, 2, 4, false, 7);

INSERT INTO public.shipping_postal_rules (zone_id, province_code, code_from, code_to, action, priority, note)
SELECT z.id, 'GP', r.f, r.t, 'include', 0, r.note FROM (VALUES
  ('johannesburg', 2000, 2199, 'Greater Johannesburg'),
  ('johannesburg', 2090, 2199, 'Johannesburg south'),
  ('pretoria-tshwane', 1, 299, 'Pretoria central and suburbs'),
  ('pretoria-tshwane', 300, 399, 'Northern Tshwane'),
  ('ekurhuleni', 1400, 1479, 'Germiston, Boksburg, Benoni'),
  ('ekurhuleni', 1480, 1679, 'Springs, Brakpan, Kempton Park'),
  ('midrand', 1680, 1699, 'Midrand'),
  ('centurion', 140, 187, 'Centurion'),
  ('west-rand', 1700, 1779, 'Roodepoort, Krugersdorp, Randfontein'),
  ('sedibeng', 1900, 1999, 'Vereeniging, Vanderbijlpark, Heidelberg')
) AS r(slug, f, t, note)
JOIN public.shipping_zones z ON z.slug = r.slug;

INSERT INTO public.delivery_class_rules (delivery_class, label, surcharge, requires_manual_quote, collection_only) VALUES
  ('standard','Standard', 0, false, false),
  ('fragile','Fragile handling', 85.00, false, false),
  ('oversized','Oversized item', 250.00, false, false),
  ('heavy','Heavy item', 180.00, false, false),
  ('supplier_confirmation','Supplier confirmation required', 0, true, false),
  ('collection_only','Collection only', 0, false, true);

INSERT INTO public.shipping_settings (id) VALUES (gen_random_uuid());

-- ============ quote routine ============
CREATE OR REPLACE FUNCTION public.quote_delivery(
  _province text,
  _city text,
  _postal_code text,
  _method text,
  _items jsonb
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  s public.shipping_settings%ROWTYPE;
  prov public.shipping_provinces%ROWTYPE;
  zone public.shipping_zones%ROWTYPE;
  rule public.shipping_postal_rules%ROWTYPE;
  item jsonb; prod public.products%ROWTYPE; qty int;
  code int;
  subtotal numeric(12,2) := 0;
  classes public.delivery_class[] := ARRAY[]::public.delivery_class[];
  cr public.delivery_class_rules%ROWTYPE;
  surcharges jsonb := '[]'::jsonb;
  surcharge_total numeric(10,2) := 0;
  base numeric(10,2) := 0;
  fee numeric(10,2) := 0;
  free_applied boolean := false;
  remote boolean := false;
  needs_quote boolean := false;
  collection_only boolean := false;
  m text := CASE WHEN _method IN ('collection','courier','manual_quote') THEN _method ELSE 'courier' END;
  estimate text;
BEGIN
  SELECT * INTO s FROM public.shipping_settings ORDER BY created_at LIMIT 1;

  IF _items IS NULL OR jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'empty_cart',
      'message', 'Your cart is empty.', 'delivery_fee', 0);
  END IF;

  -- cart analysis
  FOR item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    qty := greatest(1, least(99, coalesce(floor((item->>'quantity')::numeric)::int, 1)));
    SELECT * INTO prod FROM public.products WHERE id = (item->>'product_id')::uuid;
    IF NOT FOUND THEN CONTINUE; END IF;
    subtotal := subtotal + round(coalesce(prod.selling_price_incl_vat,0) * qty, 2);
    IF NOT (prod.delivery_class = ANY(classes)) THEN
      classes := classes || prod.delivery_class;
    END IF;
    IF prod.delivery_restricted THEN needs_quote := true; END IF;
  END LOOP;

  FOREACH cr.delivery_class IN ARRAY classes LOOP
    SELECT * INTO cr FROM public.delivery_class_rules WHERE delivery_class = cr.delivery_class;
    IF NOT FOUND OR NOT cr.is_active THEN CONTINUE; END IF;
    IF cr.requires_manual_quote THEN needs_quote := true; END IF;
    IF cr.collection_only THEN collection_only := true; END IF;
    IF cr.surcharge > 0 THEN
      surcharge_total := surcharge_total + cr.surcharge;
      surcharges := surcharges || jsonb_build_object('label', cr.label, 'amount', cr.surcharge);
    END IF;
  END LOOP;

  -- collection
  IF m = 'collection' THEN
    IF NOT s.collection_enabled THEN
      RETURN jsonb_build_object('eligible', false, 'reason', 'collection_disabled',
        'message', 'Collection is not available at the moment.', 'delivery_fee', 0,
        'subtotal_incl_vat', subtotal);
    END IF;
    RETURN jsonb_build_object(
      'eligible', true, 'method', 'collection', 'delivery_fee', 0,
      'surcharges', '[]'::jsonb, 'surcharge_total', 0,
      'province', 'GP', 'zone_id', NULL, 'zone_name', 'Collection',
      'estimate', 'Ready for collection once confirmed',
      'collection_address', s.collection_address,
      'collection_instructions', s.collection_instructions,
      'subtotal_incl_vat', subtotal, 'total_incl_vat', subtotal,
      'requires_manual_quote', needs_quote,
      'message', s.collection_instructions);
  END IF;

  IF collection_only THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'collection_only',
      'message', 'One or more items in your cart are collection only. Please choose collection.',
      'delivery_fee', 0, 'subtotal_incl_vat', subtotal, 'collection_available', s.collection_enabled);
  END IF;

  IF _province IS NULL OR btrim(_province) = '' THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'missing_province',
      'message', 'Please select a province so we can calculate delivery.',
      'delivery_fee', 0, 'subtotal_incl_vat', subtotal);
  END IF;

  SELECT * INTO prov FROM public.shipping_provinces
   WHERE upper(code) = upper(btrim(_province)) OR lower(name) = lower(btrim(_province));
  IF NOT FOUND OR NOT prov.is_active THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'province_unsupported',
      'message', s.unsupported_area_message, 'delivery_fee', 0,
      'subtotal_incl_vat', subtotal,
      'collection_available', s.collection_enabled,
      'manual_quote_available', s.manual_quote_enabled);
  END IF;

  IF _postal_code IS NULL OR btrim(_postal_code) !~ '^[0-9]{4}$' THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'invalid_postal_code',
      'message', 'Enter a valid four digit South African postal code.',
      'delivery_fee', 0, 'subtotal_incl_vat', subtotal);
  END IF;
  code := btrim(_postal_code)::int;

  SELECT * INTO rule FROM public.shipping_postal_rules r
   WHERE r.is_active AND code BETWEEN r.code_from AND r.code_to
     AND (r.province_code = prov.code OR r.province_code IS NULL)
   ORDER BY (r.action = 'exclude') DESC, r.priority DESC, (r.code_to - r.code_from) ASC
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'postal_unsupported',
      'message', 'We do not yet deliver to postal code ' || _postal_code || '. Collection may be available.',
      'delivery_fee', 0, 'subtotal_incl_vat', subtotal,
      'collection_available', s.collection_enabled,
      'manual_quote_available', s.manual_quote_enabled);
  END IF;

  IF rule.action = 'exclude' THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'postal_excluded',
      'message', coalesce(rule.note, 'Delivery to this postal code is not available.'),
      'delivery_fee', 0, 'subtotal_incl_vat', subtotal,
      'collection_available', s.collection_enabled,
      'manual_quote_available', s.manual_quote_enabled);
  END IF;

  IF rule.zone_id IS NULL THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'no_zone',
      'message', 'Delivery to this area needs a manual quote.',
      'delivery_fee', 0, 'subtotal_incl_vat', subtotal,
      'manual_quote_available', s.manual_quote_enabled);
  END IF;

  SELECT * INTO zone FROM public.shipping_zones WHERE id = rule.zone_id;
  IF NOT FOUND OR NOT zone.is_active THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'zone_inactive',
      'message', s.unsupported_area_message, 'delivery_fee', 0,
      'subtotal_incl_vat', subtotal, 'collection_available', s.collection_enabled);
  END IF;
  IF zone.is_suspended THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'zone_suspended',
      'message', coalesce(zone.suspension_note, 'Delivery to ' || zone.name || ' is temporarily suspended.'),
      'delivery_fee', 0, 'subtotal_incl_vat', subtotal,
      'collection_available', s.collection_enabled);
  END IF;

  -- delivery classes allowed in this zone
  FOREACH cr.delivery_class IN ARRAY classes LOOP
    IF cr.delivery_class NOT IN ('supplier_confirmation','collection_only')
       AND NOT (cr.delivery_class = ANY(zone.allowed_delivery_classes)) THEN
      RETURN jsonb_build_object('eligible', false, 'reason', 'class_unsupported',
        'message', 'One or more items cannot be delivered to ' || zone.name || ' by standard courier.',
        'delivery_fee', 0, 'subtotal_incl_vat', subtotal,
        'manual_quote_available', s.manual_quote_enabled,
        'collection_available', s.collection_enabled);
    END IF;
  END LOOP;

  base := coalesce(rule.override_fee, zone.base_fee);

  IF zone.free_delivery_threshold IS NOT NULL AND subtotal >= zone.free_delivery_threshold THEN
    base := 0; free_applied := true;
  END IF;

  IF rule.action = 'remote' OR rule.surcharge > 0 THEN
    remote := (rule.action = 'remote');
    IF remote AND zone.remote_surcharge > 0 THEN
      surcharge_total := surcharge_total + zone.remote_surcharge;
      surcharges := surcharges || jsonb_build_object('label', 'Remote area surcharge', 'amount', zone.remote_surcharge);
    END IF;
    IF rule.surcharge > 0 THEN
      surcharge_total := surcharge_total + rule.surcharge;
      surcharges := surcharges || jsonb_build_object('label', coalesce(rule.note,'Area surcharge'), 'amount', rule.surcharge);
    END IF;
  END IF;

  fee := round(base + surcharge_total, 2);
  estimate := zone.estimate_min_days || '-' || zone.estimate_max_days || ' business days';

  RETURN jsonb_build_object(
    'eligible', true,
    'method', CASE WHEN needs_quote THEN 'supplier_confirmation' ELSE 'courier' END,
    'requires_manual_quote', needs_quote,
    'province', prov.code, 'province_name', prov.name,
    'zone_id', zone.id, 'zone_name', zone.name,
    'base_fee', base, 'free_delivery_applied', free_applied,
    'free_delivery_threshold', zone.free_delivery_threshold,
    'surcharges', surcharges, 'surcharge_total', surcharge_total,
    'delivery_fee', fee, 'estimate', estimate,
    'remote', remote,
    'subtotal_incl_vat', subtotal, 'total_incl_vat', round(subtotal + fee, 2),
    'message', CASE WHEN needs_quote
      THEN 'Some items need supplier confirmation. We will confirm lead time before payment.'
      ELSE 'Delivery to ' || zone.name || ', ' || estimate END);
END; $$;

REVOKE ALL ON FUNCTION public.quote_delivery(text,text,text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.quote_delivery(text,text,text,text,jsonb) TO authenticated, anon, service_role;

-- ============ place_order with server-side delivery ============
CREATE OR REPLACE FUNCTION public.place_order(
  _items jsonb, _contact_name text, _contact_email text, _contact_phone text,
  _delivery_address jsonb, _delivery_method text, _customer_notes text, _idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  actor uuid := auth.uid();
  existing public.orders%ROWTYPE;
  new_order public.orders%ROWTYPE;
  item jsonb; pid uuid; qty int; prod public.products%ROWTYPE;
  v_subtotal numeric(12,2) := 0; v_delivery numeric(12,2) := 0; v_vat numeric(12,2);
  v_method text; line_total numeric(12,2); item_count int;
  resolved jsonb := '[]'::jsonb; e jsonb;
  q jsonb;
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
      'delivery_method', existing.delivery_method, 'delivery_zone_name', existing.delivery_zone_name,
      'delivery_estimate', existing.delivery_estimate, 'duplicate', true);
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

  -- Server-authoritative delivery quote. The browser never supplies a fee.
  q := public.quote_delivery(
        nullif(btrim(coalesce(_delivery_address->>'province','')),''),
        nullif(btrim(coalesce(_delivery_address->>'city','')),''),
        nullif(btrim(coalesce(_delivery_address->>'postal_code','')),''),
        v_method, _items);

  IF NOT (q->>'eligible')::boolean THEN
    RAISE EXCEPTION '%', coalesce(q->>'message', 'Delivery is not available for this address');
  END IF;

  v_delivery := coalesce((q->>'delivery_fee')::numeric, 0);
  v_vat := round((v_subtotal + v_delivery) - ((v_subtotal + v_delivery) / 1.15), 2);

  INSERT INTO public.orders (
    user_id, contact_name, contact_email, contact_phone, delivery_address,
    delivery_method, customer_notes, idempotency_key,
    subtotal_incl_vat, vat_amount, delivery_fee, total_incl_vat,
    payment_method, payment_source, payment_status, status,
    delivery_province, delivery_zone_id, delivery_zone_name, delivery_estimate,
    delivery_surcharges, delivery_quote
  ) VALUES (
    actor, left(btrim(_contact_name),100), left(btrim(_contact_email),255),
    left(btrim(coalesce(_contact_phone,'')),20),
    CASE WHEN v_method = 'collection' THEN NULL ELSE _delivery_address END,
    v_method, nullif(left(coalesce(_customer_notes,''),1000),''), _idempotency_key,
    v_subtotal, v_vat, v_delivery, round(v_subtotal + v_delivery, 2),
    'request_order', 'none', 'unpaid', 'new',
    q->>'province', nullif(q->>'zone_id','')::uuid, q->>'zone_name', q->>'estimate',
    coalesce(q->'surcharges','[]'::jsonb), q
  ) RETURNING * INTO new_order;

  INSERT INTO public.order_items (
    order_id, product_id, sku, name, quantity, unit_price_incl_vat, line_total_incl_vat)
  SELECT new_order.id, (e2->>'product_id')::uuid, e2->>'sku', e2->>'name',
         (e2->>'quantity')::int, (e2->>'unit')::numeric, (e2->>'line_total')::numeric
  FROM jsonb_array_elements(resolved) e2;

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
    'delivery_method', new_order.delivery_method, 'delivery_zone_name', new_order.delivery_zone_name,
    'delivery_estimate', new_order.delivery_estimate, 'duplicate', false);
END; $$;

-- ============ status workflow with collection stage ============
CREATE OR REPLACE FUNCTION public.set_order_status(_order_id uuid, _status order_status, _note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
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
    WHEN 'processing' THEN ARRAY['ready_for_dispatch','ready_for_collection','cancelled']
    WHEN 'ready_for_dispatch' THEN ARRAY['shipped','cancelled']
    WHEN 'ready_for_collection' THEN ARRAY['delivered','cancelled']
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
END; $$;

-- delivery fields are order identity; block client tampering
CREATE OR REPLACE FUNCTION public.protect_order_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
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
     OR NEW.stock_released IS DISTINCT FROM OLD.stock_released
     OR NEW.delivery_province IS DISTINCT FROM OLD.delivery_province
     OR NEW.delivery_zone_id IS DISTINCT FROM OLD.delivery_zone_id
     OR NEW.delivery_zone_name IS DISTINCT FROM OLD.delivery_zone_name
     OR NEW.delivery_surcharges IS DISTINCT FROM OLD.delivery_surcharges
     OR NEW.delivery_quote IS DISTINCT FROM OLD.delivery_quote
     OR NEW.delivery_method IS DISTINCT FROM OLD.delivery_method THEN
    RAISE EXCEPTION 'Order identity, delivery and monetary fields cannot be modified';
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
END; $$;