
-- 1. Apply: typed writes, whitelist, brand/category support -----------------
CREATE OR REPLACE FUNCTION public.apply_catalogue_import(_import_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  r record;
  _created int := 0;
  _updated int := 0;
  _failed int := 0;
  _pid uuid;
  _field text;
  _new jsonb;
  _old jsonb;
  _slug text;
  _dtype text;
  _allowed text[] := ARRAY['name','short_description','full_description','specifications_text',
    'dealer_price_ex_vat','promotional_price_ex_vat','source_availability_raw',
    'brand_id','category_id','subcategory_id','model_number','part_number','supplier_sku',
    'screen_size','capacity','colour'];
BEGIN
  IF NOT public.is_admin(_uid) THEN
    RAISE EXCEPTION 'Only administrators may apply catalogue imports';
  END IF;

  FOR r IN
    SELECT * FROM public.catalogue_import_rows
    WHERE import_id = _import_id AND decision = 'approved'
      AND change_type IN ('new','update','discontinued')
    ORDER BY source_row_number
  LOOP
    BEGIN
      IF r.validation_error IS NOT NULL THEN
        CONTINUE;
      END IF;

      IF r.change_type = 'new' THEN
        _slug := left(regexp_replace(lower(coalesce(r.product_name, r.supplier_sku)), '[^a-z0-9]+', '-', 'g'), 70)
                 || '-' || left(replace(gen_random_uuid()::text, '-', ''), 6);
        INSERT INTO public.products (
          sku, name, slug, short_description, full_description,
          supplier_sku, model_number, part_number,
          brand_id, category_id,
          dealer_price_ex_vat, promotional_price_ex_vat,
          source_availability_raw, is_published, import_batch_id, last_seen_import_id,
          specifications_text
        ) VALUES (
          r.supplier_sku, coalesce(r.product_name, r.supplier_sku), _slug,
          nullif(r.normalised->>'short_description',''), nullif(r.normalised->>'full_description',''),
          r.supplier_sku, r.model_number, r.part_number,
          nullif(r.proposed_changes->'brand_id'->>'new','')::uuid,
          nullif(r.proposed_changes->'category_id'->>'new','')::uuid,
          nullif(r.normalised->>'dealer_price_ex_vat','')::numeric,
          nullif(r.normalised->>'promotional_price_ex_vat','')::numeric,
          nullif(r.normalised->>'availability_raw',''),
          false, _import_id, _import_id,
          nullif(r.normalised->>'specifications_text','')
        )
        RETURNING id INTO _pid;

        _created := _created + 1;
        INSERT INTO public.catalogue_change_log (import_id, row_id, product_id, action, applied_by)
        VALUES (_import_id, r.id, _pid, 'product_created', _uid);

      ELSIF r.matched_product_id IS NOT NULL THEN
        _pid := r.matched_product_id;

        FOR _field, _new IN SELECT key, value FROM jsonb_each(r.proposed_changes)
        LOOP
          _old := _new->'old';
          CONTINUE WHEN NOT (_field = ANY(_allowed));
          IF (_new->>'new') IS NULL OR btrim(coalesce(_new->>'new','')) = '' THEN
            CONTINUE;
          END IF;

          SELECT data_type INTO _dtype FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'products' AND column_name = _field;
          IF _dtype IS NULL THEN CONTINUE; END IF;

          EXECUTE format(
            'UPDATE public.products SET %I = $1::text::%s, last_seen_import_id = $2 WHERE id = $3',
            _field, _dtype
          ) USING (_new->>'new'), _import_id, _pid;

          INSERT INTO public.catalogue_change_log
            (import_id, row_id, product_id, action, field, old_value, new_value, applied_by)
          VALUES (_import_id, r.id, _pid, 'field_updated', _field, _old, _new->'new', _uid);
        END LOOP;

        IF r.change_type = 'discontinued' THEN
          UPDATE public.products
            SET is_discontinued = true, stock_status = 'discontinued',
                inventory_mode = 'discontinued', last_seen_import_id = _import_id
          WHERE id = _pid;
          INSERT INTO public.catalogue_change_log (import_id, row_id, product_id, action, applied_by)
          VALUES (_import_id, r.id, _pid, 'marked_discontinued', _uid);
        ELSE
          UPDATE public.products SET last_seen_import_id = _import_id WHERE id = _pid;
        END IF;

        _updated := _updated + 1;
      ELSE
        CONTINUE;
      END IF;

      UPDATE public.catalogue_import_rows SET decision = 'applied' WHERE id = r.id;
    EXCEPTION WHEN OTHERS THEN
      _failed := _failed + 1;
      UPDATE public.catalogue_import_rows
        SET decision = 'failed', validation_error = SQLERRM WHERE id = r.id;
    END;
  END LOOP;

  UPDATE public.catalogue_imports
    SET status = 'completed', created_count = _created, updated_count = _updated,
        error_count = _failed, approved_by = _uid, approved_at = now()
  WHERE id = _import_id;

  RETURN jsonb_build_object('created', _created, 'updated', _updated, 'failed', _failed);
END;
$$;

-- 2. Rollback: typed reverts + idempotency ---------------------------------
CREATE OR REPLACE FUNCTION public.rollback_catalogue_import(_import_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  c record;
  _reverted int := 0;
  _deleted int := 0;
  _dtype text;
BEGIN
  IF NOT public.is_admin(_uid) THEN
    RAISE EXCEPTION 'Only administrators may roll back catalogue imports';
  END IF;

  IF EXISTS (SELECT 1 FROM public.catalogue_change_log
             WHERE import_id = _import_id AND action = 'import_rolled_back') THEN
    RETURN jsonb_build_object('fields_reverted', 0, 'products_deleted', 0,
                              'already_rolled_back', true);
  END IF;

  FOR c IN
    SELECT * FROM public.catalogue_change_log
    WHERE import_id = _import_id AND action = 'field_updated'
    ORDER BY applied_at DESC
  LOOP
    SELECT data_type INTO _dtype FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = c.field;
    IF _dtype IS NULL THEN CONTINUE; END IF;

    IF c.old_value IS NULL OR jsonb_typeof(c.old_value) = 'null' THEN
      EXECUTE format('UPDATE public.products SET %I = NULL WHERE id = $1', c.field)
        USING c.product_id;
    ELSE
      EXECUTE format('UPDATE public.products SET %I = $1::text::%s WHERE id = $2', c.field, _dtype)
        USING (c.old_value #>> '{}'), c.product_id;
    END IF;
    _reverted := _reverted + 1;
  END LOOP;

  FOR c IN
    SELECT * FROM public.catalogue_change_log
    WHERE import_id = _import_id AND action = 'marked_discontinued'
  LOOP
    UPDATE public.products SET is_discontinued = false, inventory_mode = 'supplier_confirmation'
    WHERE id = c.product_id;
  END LOOP;

  FOR c IN
    SELECT * FROM public.catalogue_change_log
    WHERE import_id = _import_id AND action = 'product_created'
  LOOP
    DELETE FROM public.product_images WHERE product_id = c.product_id;
    DELETE FROM public.product_specifications WHERE product_id = c.product_id;
    DELETE FROM public.products WHERE id = c.product_id AND import_batch_id = _import_id;
    _deleted := _deleted + 1;
  END LOOP;

  INSERT INTO public.catalogue_change_log (import_id, action, applied_by)
  VALUES (_import_id, 'import_rolled_back', _uid);

  UPDATE public.catalogue_imports SET status = 'cancelled' WHERE id = _import_id;
  UPDATE public.catalogue_import_rows SET decision = 'rejected'
    WHERE import_id = _import_id AND decision = 'applied';

  RETURN jsonb_build_object('fields_reverted', _reverted, 'products_deleted', _deleted,
                            'already_rolled_back', false);
END;
$$;

-- 3. Absent products become reviewable rows, never auto-unpublished --------
CREATE OR REPLACE FUNCTION public.flag_absent_products(_import_id uuid, _supplier text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _n int := 0; _sup text; p record;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only administrators may flag absent products';
  END IF;

  SELECT nullif(btrim(coalesce(nullif(_supplier,''), supplier)), '')
    INTO _sup FROM public.catalogue_imports WHERE id = _import_id;
  IF _sup IS NULL THEN RETURN 0; END IF;

  FOR p IN
    SELECT pr.id, pr.sku, pr.name, pr.supplier_sku, pr.selling_price_incl_vat
    FROM public.products pr
    WHERE pr.is_discontinued = false
      AND pr.last_seen_import_id IS DISTINCT FROM _import_id
      AND (
        pr.import_batch_id IN (SELECT id FROM public.catalogue_imports WHERE supplier = _sup)
        OR pr.last_seen_import_id IN (SELECT id FROM public.catalogue_imports WHERE supplier = _sup)
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.catalogue_import_rows r
        WHERE r.import_id = _import_id AND r.matched_product_id = pr.id
      )
  LOOP
    INSERT INTO public.catalogue_import_rows (
      import_id, source_worksheet, source_row_number, supplier_sku, product_name,
      raw_row, normalised, matched_product_id, match_method, match_reason,
      match_confidence, confidence_band, change_type, proposed_changes,
      review_reason, decision
    ) VALUES (
      _import_id, 'catalogue reconciliation', 0, p.supplier_sku, p.name,
      jsonb_build_object('product_sku', p.sku), '{}'::jsonb, p.id, 'catalogue_reconciliation',
      'Existing product was not found anywhere in this supplier file.',
      100, 'manual_review', 'missing', '{}'::jsonb,
      'Absent from the latest ' || _sup || ' catalogue — review manually. Nothing was changed automatically.',
      'pending'
    );
    _n := _n + 1;
  END LOOP;

  RETURN _n;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_catalogue_import(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rollback_catalogue_import(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.flag_absent_products(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_catalogue_import(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rollback_catalogue_import(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.flag_absent_products(uuid, text) TO authenticated;
