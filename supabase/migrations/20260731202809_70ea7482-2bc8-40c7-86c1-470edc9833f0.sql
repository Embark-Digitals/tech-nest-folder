CREATE OR REPLACE FUNCTION public.quote_delivery(
  _province text, _city text, _postal_code text, _method text, _items jsonb
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  s public.shipping_settings%ROWTYPE;
  prov public.shipping_provinces%ROWTYPE;
  zone public.shipping_zones%ROWTYPE;
  rule public.shipping_postal_rules%ROWTYPE;
  item jsonb; prod public.products%ROWTYPE; qty int;
  pcode int;
  subtotal numeric(12,2) := 0;
  classes public.delivery_class[] := ARRAY[]::public.delivery_class[];
  dc public.delivery_class;
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

  FOR item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    qty := greatest(1, least(99, coalesce(floor((item->>'quantity')::numeric)::int, 1)));
    SELECT * INTO prod FROM public.products WHERE products.id = (item->>'product_id')::uuid;
    IF NOT FOUND THEN CONTINUE; END IF;
    subtotal := subtotal + round(coalesce(prod.selling_price_incl_vat,0) * qty, 2);
    IF NOT (prod.delivery_class = ANY(classes)) THEN classes := classes || prod.delivery_class; END IF;
    IF prod.delivery_restricted THEN needs_quote := true; END IF;
  END LOOP;

  FOREACH dc IN ARRAY classes LOOP
    SELECT * INTO cr FROM public.delivery_class_rules r WHERE r.delivery_class = dc;
    IF NOT FOUND OR NOT cr.is_active THEN CONTINUE; END IF;
    IF cr.requires_manual_quote THEN needs_quote := true; END IF;
    IF cr.collection_only THEN collection_only := true; END IF;
    IF cr.surcharge > 0 THEN
      surcharge_total := surcharge_total + cr.surcharge;
      surcharges := surcharges || jsonb_build_object('label', cr.label, 'amount', cr.surcharge);
    END IF;
  END LOOP;

  IF m = 'collection' THEN
    IF NOT s.collection_enabled THEN
      RETURN jsonb_build_object('eligible', false, 'reason', 'collection_disabled',
        'message', 'Collection is not available at the moment.', 'delivery_fee', 0,
        'subtotal_incl_vat', subtotal);
    END IF;
    RETURN jsonb_build_object('eligible', true, 'method', 'collection', 'delivery_fee', 0,
      'surcharges', '[]'::jsonb, 'surcharge_total', 0, 'province', 'GP', 'zone_id', NULL,
      'zone_name', 'Collection', 'estimate', 'Ready for collection once confirmed',
      'collection_address', s.collection_address, 'collection_instructions', s.collection_instructions,
      'subtotal_incl_vat', subtotal, 'total_incl_vat', subtotal,
      'requires_manual_quote', needs_quote, 'message', s.collection_instructions);
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

  SELECT * INTO prov FROM public.shipping_provinces sp
   WHERE upper(sp.code) = upper(btrim(_province)) OR lower(sp.name) = lower(btrim(_province));
  IF NOT FOUND OR NOT prov.is_active THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'province_unsupported',
      'message', s.unsupported_area_message, 'delivery_fee', 0, 'subtotal_incl_vat', subtotal,
      'collection_available', s.collection_enabled, 'manual_quote_available', s.manual_quote_enabled);
  END IF;

  IF _postal_code IS NULL OR btrim(_postal_code) !~ '^[0-9]{4}$' THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'invalid_postal_code',
      'message', 'Enter a valid four digit South African postal code.',
      'delivery_fee', 0, 'subtotal_incl_vat', subtotal);
  END IF;
  pcode := btrim(_postal_code)::int;

  SELECT * INTO rule FROM public.shipping_postal_rules r
   WHERE r.is_active AND pcode BETWEEN r.code_from AND r.code_to
     AND (r.province_code = prov.code OR r.province_code IS NULL)
   ORDER BY (r.action = 'exclude') DESC, r.priority DESC, (r.code_to - r.code_from) ASC
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'postal_unsupported',
      'message', 'We do not yet deliver to postal code ' || _postal_code || '. Collection may be available.',
      'delivery_fee', 0, 'subtotal_incl_vat', subtotal,
      'collection_available', s.collection_enabled, 'manual_quote_available', s.manual_quote_enabled);
  END IF;

  IF rule.action = 'exclude' THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'postal_excluded',
      'message', coalesce(rule.note, 'Delivery to this postal code is not available.'),
      'delivery_fee', 0, 'subtotal_incl_vat', subtotal,
      'collection_available', s.collection_enabled, 'manual_quote_available', s.manual_quote_enabled);
  END IF;

  IF rule.zone_id IS NULL THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'no_zone',
      'message', 'Delivery to this area needs a manual quote.',
      'delivery_fee', 0, 'subtotal_incl_vat', subtotal, 'manual_quote_available', s.manual_quote_enabled);
  END IF;

  SELECT * INTO zone FROM public.shipping_zones z WHERE z.id = rule.zone_id;
  IF NOT FOUND OR NOT zone.is_active THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'zone_inactive',
      'message', s.unsupported_area_message, 'delivery_fee', 0,
      'subtotal_incl_vat', subtotal, 'collection_available', s.collection_enabled);
  END IF;
  IF zone.is_suspended THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'zone_suspended',
      'message', coalesce(zone.suspension_note, 'Delivery to ' || zone.name || ' is temporarily suspended.'),
      'delivery_fee', 0, 'subtotal_incl_vat', subtotal, 'collection_available', s.collection_enabled);
  END IF;

  FOREACH dc IN ARRAY classes LOOP
    IF dc NOT IN ('supplier_confirmation','collection_only')
       AND NOT (dc = ANY(zone.allowed_delivery_classes)) THEN
      RETURN jsonb_build_object('eligible', false, 'reason', 'class_unsupported',
        'message', 'One or more items cannot be delivered to ' || zone.name || ' by standard courier.',
        'delivery_fee', 0, 'subtotal_incl_vat', subtotal,
        'manual_quote_available', s.manual_quote_enabled, 'collection_available', s.collection_enabled);
    END IF;
  END LOOP;

  base := coalesce(rule.override_fee, zone.base_fee);
  IF zone.free_delivery_threshold IS NOT NULL AND subtotal >= zone.free_delivery_threshold THEN
    base := 0; free_applied := true;
  END IF;

  IF rule.action = 'remote' AND zone.remote_surcharge > 0 THEN
    remote := true;
    surcharge_total := surcharge_total + zone.remote_surcharge;
    surcharges := surcharges || jsonb_build_object('label','Remote area surcharge','amount', zone.remote_surcharge);
  END IF;
  IF rule.surcharge > 0 THEN
    surcharge_total := surcharge_total + rule.surcharge;
    surcharges := surcharges || jsonb_build_object('label', coalesce(rule.note,'Area surcharge'), 'amount', rule.surcharge);
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
    'delivery_fee', fee, 'estimate', estimate, 'remote', remote,
    'subtotal_incl_vat', subtotal, 'total_incl_vat', round(subtotal + fee, 2),
    'message', CASE WHEN needs_quote
      THEN 'Some items need supplier confirmation. We will confirm lead time before payment.'
      ELSE 'Delivery to ' || zone.name || ', ' || estimate END);
END; $$;

GRANT EXECUTE ON FUNCTION public.quote_delivery(text,text,text,text,jsonb)
  TO authenticated, anon, service_role, supabase_read_only_user;