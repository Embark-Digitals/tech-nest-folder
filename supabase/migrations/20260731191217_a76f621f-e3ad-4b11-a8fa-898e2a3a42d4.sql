-- Supplier catalogue files: admin-only, private
CREATE POLICY "admins read supplier files" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'supplier-catalogues' AND public.is_admin(auth.uid()));
CREATE POLICY "admins upload supplier files" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'supplier-catalogues' AND public.is_admin(auth.uid()));
CREATE POLICY "admins delete supplier files" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'supplier-catalogues' AND public.is_admin(auth.uid()));

-- =========================================================
-- APPLY APPROVED IMPORT ROWS
-- =========================================================
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
BEGIN
  IF NOT public.is_admin(_uid) THEN
    RAISE EXCEPTION 'Only administrators may apply catalogue imports';
  END IF;

  FOR r IN
    SELECT * FROM public.catalogue_import_rows
    WHERE import_id = _import_id AND decision = 'approved'
    ORDER BY source_row_number
  LOOP
    BEGIN
      IF r.change_type = 'new' THEN
        _slug := left(regexp_replace(lower(coalesce(r.product_name, r.supplier_sku)), '[^a-z0-9]+', '-', 'g'), 70)
                 || '-' || left(replace(gen_random_uuid()::text, '-', ''), 6);
        INSERT INTO public.products (
          sku, name, slug, short_description, full_description,
          supplier_sku, model_number, part_number,
          dealer_price_ex_vat, promotional_price_ex_vat,
          supplier_availability_raw, is_published, import_batch_id, last_seen_import_id,
          specifications_text
        ) VALUES (
          r.supplier_sku, coalesce(r.product_name, r.supplier_sku), _slug,
          nullif(r.normalised->>'short_description',''), nullif(r.normalised->>'full_description',''),
          r.supplier_sku, r.model_number, r.part_number,
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

      ELSIF r.change_type IN ('update','discontinued') AND r.matched_product_id IS NOT NULL THEN
        _pid := r.matched_product_id;

        FOR _field, _new IN SELECT key, value FROM jsonb_each(r.proposed_changes)
        LOOP
          _old := _new->'old';
          -- data preservation: never blank out an existing filled value
          IF (_new->>'new') IS NULL OR btrim(coalesce(_new->>'new','')) = '' THEN
            CONTINUE;
          END IF;

          EXECUTE format(
            'UPDATE public.products SET %I = $1, last_seen_import_id = $2 WHERE id = $3',
            _field
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

REVOKE ALL ON FUNCTION public.apply_catalogue_import(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_catalogue_import(uuid) TO authenticated;

-- =========================================================
-- ROLLBACK AN APPLIED IMPORT BATCH
-- =========================================================
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
BEGIN
  IF NOT public.is_admin(_uid) THEN
    RAISE EXCEPTION 'Only administrators may roll back catalogue imports';
  END IF;

  FOR c IN
    SELECT * FROM public.catalogue_change_log
    WHERE import_id = _import_id AND action = 'field_updated'
    ORDER BY applied_at DESC
  LOOP
    EXECUTE format('UPDATE public.products SET %I = $1 WHERE id = $2', c.field)
      USING (c.old_value #>> '{}'), c.product_id;
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

  RETURN jsonb_build_object('fields_reverted', _reverted, 'products_deleted', _deleted);
END;
$$;

REVOKE ALL ON FUNCTION public.rollback_catalogue_import(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rollback_catalogue_import(uuid) TO authenticated;

-- =========================================================
-- FLAG PRODUCTS ABSENT FROM THE LATEST CATALOGUE (never unpublish)
-- =========================================================
CREATE OR REPLACE FUNCTION public.flag_absent_products(_import_id uuid, _supplier text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _n int;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only administrators may flag absent products';
  END IF;

  UPDATE public.products p
    SET catalogue_review_reason = 'Absent from supplier catalogue ' || coalesce(_supplier, 'latest')
  WHERE p.is_published
    AND p.is_discontinued = false
    AND (p.last_seen_import_id IS DISTINCT FROM _import_id)
    AND EXISTS (SELECT 1 FROM public.catalogue_import_rows r WHERE r.import_id = _import_id);
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END;
$$;

REVOKE ALL ON FUNCTION public.flag_absent_products(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.flag_absent_products(uuid, text) TO authenticated;