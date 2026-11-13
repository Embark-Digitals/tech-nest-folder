-- =====================================================================
-- Thola Something / TechNest — DB batch 1: catalogue clean-up
-- Prepared 2026-11-12, reviewed 2026-11-13. Run in the Lovable Cloud SQL editor
-- (no Lovable agent). A copy is committed to supabase/migrations as the record. Every change is backward compatible
-- with the frontend currently live on main (0d96567).
-- =====================================================================

-- ---------------------------------------------------------------------
-- A2. Map supplier availability text -> stock_status / supplier_availability
-- Ported from scripts/import/parse-workbooks.ts mapAvailability, extended for
-- Atlas wording ("ETA Oct", "Coming Soon", "While stocks last", "In Stoock").
-- \m and \M are word boundaries, so "eta" cannot match inside other words.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.map_supplier_availability(_raw text)
RETURNS TABLE (
  stock public.stock_status,
  supplier public.supplier_availability,
  clearance boolean,
  discontinued boolean,
  is_new boolean
)
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  WITH t AS (
    SELECT lower(coalesce(_raw, '')) AS s
  ), f AS (
    SELECT
      s,
      s ~ '\m(eol|end of life|discontinued|obsolete|delisted)\M'              AS f_dead,
      s ~ '\m(sold out|out of stock|no stock)\M'                              AS f_out,
      s ~ '\m(eta|coming soon|pre-?order|special order|back ?order)\M'        AS f_eta,
      s ~ '\m(clearance|to clear|last buy|while stocks? last)\M'              AS f_clear,
      s ~ '\m(low stock|limited)\M'                                           AS f_low,
      s ~ '\m(in sto+ck|available|soh)\M'                                     AS f_in,
      s ~ '\mnew\M'                                                           AS f_new
    FROM t
  )
  SELECT
    (CASE
      WHEN f_dead  THEN 'discontinued'
      WHEN f_out   THEN 'out_of_stock'
      WHEN f_eta   THEN 'preorder'
      WHEN f_clear OR f_low THEN 'low_stock'
      WHEN f_in    THEN 'available'
      ELSE 'awaiting_confirmation'
    END)::public.stock_status,
    (CASE
      WHEN f_dead  THEN 'end_of_life'
      WHEN f_out   THEN 'out_of_stock'
      WHEN f_eta   THEN 'eta'
      WHEN f_clear THEN 'clearance'
      WHEN f_low   THEN 'low_stock'
      WHEN f_in AND f_new THEN 'new_in_stock'
      WHEN f_in    THEN 'in_stock'
      ELSE 'unknown'
    END)::public.supplier_availability,
    f_clear,
    f_dead,
    f_new
  FROM f;
$$;

-- Applies the mapping whenever the supplier's availability text changes.
-- Blank text = no supplier signal: the current status is kept.
-- Products with tracked stock keep their quantity-driven status.
CREATE OR REPLACE FUNCTION public.products_apply_supplier_availability()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE m record;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.source_availability_raw IS NOT DISTINCT FROM OLD.source_availability_raw THEN
    RETURN NEW;
  END IF;
  IF NEW.source_availability_raw IS NULL OR btrim(NEW.source_availability_raw) = '' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO m FROM public.map_supplier_availability(NEW.source_availability_raw);
  NEW.supplier_availability := m.supplier;
  NEW.is_clearance := m.clearance;
  NEW.is_new_arrival := m.is_new;

  IF m.discontinued THEN
    NEW.is_discontinued := true;
    NEW.stock_status := 'discontinued';
    NEW.inventory_mode := 'discontinued';
  ELSE
    -- the supplier lists it again, so it is no longer end-of-life
    IF NEW.is_discontinued THEN
      NEW.is_discontinued := false;
      IF NEW.inventory_mode = 'discontinued' THEN
        NEW.inventory_mode := 'supplier_confirmation';
      END IF;
    END IF;
    IF NEW.inventory_mode IS DISTINCT FROM 'tracked' THEN
      NEW.stock_status := m.stock;
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_products_supplier_availability ON public.products;
CREATE TRIGGER trg_products_supplier_availability
  BEFORE INSERT OR UPDATE OF source_availability_raw ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.products_apply_supplier_availability();

-- One-time backfill for rows already holding supplier text. Conservative:
-- it never un-discontinues anything; only a future list change does that.
WITH m AS (
  SELECT p.id, x.stock, x.supplier, x.clearance, x.discontinued, x.is_new
    FROM public.products p
   CROSS JOIN LATERAL public.map_supplier_availability(p.source_availability_raw) x
   WHERE p.source_availability_raw IS NOT NULL
     AND btrim(p.source_availability_raw) <> ''
)
UPDATE public.products p
   SET supplier_availability = m.supplier,
       is_clearance = m.clearance,
       is_new_arrival = m.is_new,
       is_discontinued = p.is_discontinued OR m.discontinued,
       stock_status = CASE
         WHEN p.is_discontinued OR m.discontinued THEN 'discontinued'::public.stock_status
         WHEN p.inventory_mode = 'tracked' THEN p.stock_status
         ELSE m.stock END,
       inventory_mode = CASE WHEN m.discontinued THEN 'discontinued'::public.inventory_mode
                             ELSE p.inventory_mode END
  FROM m
 WHERE m.id = p.id;

-- ---------------------------------------------------------------------
-- A3. Pricing: cost base = promo price, else dealer price (founder decision)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_pricing()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE ex numeric(14,6); v numeric(14,6); base numeric(14,6); r public.rounding_method;
BEGIN
  SELECT rounding INTO r FROM public.pricing_settings ORDER BY created_at LIMIT 1;
  base := CASE
            WHEN NEW.promotional_price_ex_vat > 0 THEN NEW.promotional_price_ex_vat
            WHEN NEW.dealer_price_ex_vat > 0 THEN NEW.dealer_price_ex_vat
            ELSE NULL
          END;
  IF base IS NULL THEN
    NEW.markup_amount := NULL; NEW.selling_price_ex_vat := NULL;
    NEW.vat_amount := NULL; NEW.selling_price_incl_vat := NULL;
    NEW.pricing_review_required := true;
    NEW.is_published := false;
    RETURN NEW;
  END IF;
  ex := base * (1 + NEW.markup_rate);
  v := ex * NEW.vat_rate;
  NEW.markup_amount := round(ex - base, 2);
  NEW.selling_price_ex_vat := round(ex, 2);
  NEW.vat_amount := round(v, 2);
  NEW.selling_price_incl_vat := CASE COALESCE(r,'exact')
    WHEN 'nearest_rand' THEN round(ex + v, 0)
    WHEN 'nearest_ten' THEN round((ex + v) / 10, 0) * 10
    WHEN 'ends_99' THEN floor(ex + v) + 0.99
    ELSE round(ex + v, 2) END;
  NEW.pricing_review_required := false;
  RETURN NEW;
END; $$;

-- Re-save dealer-only products so they get a price. The pricing trigger never
-- publishes, so they stay unpublished until a founder reviews them.
UPDATE public.products
   SET markup_rate = markup_rate
 WHERE (promotional_price_ex_vat IS NULL OR promotional_price_ex_vat <= 0)
   AND dealer_price_ex_vat > 0;

-- ---------------------------------------------------------------------
-- A5. Price lists: "missing" detection scoped per Atlas list
-- ---------------------------------------------------------------------
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS price_list text;
ALTER TABLE public.catalogue_imports ADD COLUMN IF NOT EXISTS price_list text;
CREATE INDEX IF NOT EXISTS products_price_list_idx ON public.products (price_list);

-- Backfill from the workbook each staged product came from.
-- (Patterns confirmed against live source_workbook values before applying.)
UPDATE public.products SET price_list = 'atlas_home_appliances'
 WHERE price_list IS NULL AND source_workbook ILIKE '%HA Price List%';
UPDATE public.products SET price_list = 'atlas_audio_visual'
 WHERE price_list IS NULL AND source_workbook ILIKE '%Audio Visual%';

CREATE OR REPLACE FUNCTION public.flag_absent_products(_import_id uuid, _supplier text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _n int := 0; _sup text; _list text; p record;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only administrators may flag absent products';
  END IF;

  SELECT price_list, nullif(btrim(coalesce(nullif(_supplier,''), supplier)), '')
    INTO _list, _sup
    FROM public.catalogue_imports WHERE id = _import_id;

  FOR p IN
    SELECT pr.id, pr.sku, pr.name, pr.supplier_sku
    FROM public.products pr
    WHERE pr.is_discontinued = false
      AND pr.is_published = true
      AND pr.last_seen_import_id IS DISTINCT FROM _import_id
      AND (
        (_list IS NOT NULL AND pr.price_list = _list)
        OR (_list IS NULL AND _sup IS NOT NULL AND (
              pr.import_batch_id IN (SELECT id FROM public.catalogue_imports WHERE supplier = _sup)
              OR pr.last_seen_import_id IN (SELECT id FROM public.catalogue_imports WHERE supplier = _sup)))
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
      'Published product was not found anywhere in this price list.',
      100, 'manual_review', 'missing', '{}'::jsonb,
      'Not on the latest ' || coalesce(_list, _sup, 'supplier') || ' list. Approve to hide it from the shop (reversible), or reject to keep it.',
      'pending'
    );
    _n := _n + 1;
  END LOOP;

  RETURN _n;
END;
$$;

-- ---------------------------------------------------------------------
-- A3 + A5. Apply: exact prices, settings markup, price list, locked skip,
-- and approvable "missing" rows (hide from shop).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_catalogue_import(_import_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  _uid uuid := auth.uid();
  r record;
  _created int := 0;
  _updated int := 0;
  _hidden int := 0;
  _locked int := 0;
  _failed int := 0;
  _pid uuid;
  _field text;
  _new jsonb;
  _old jsonb;
  _slug text;
  _dtype text;
  _dead boolean;
  _list text;
  _markup numeric;
  _allowed text[] := ARRAY['name','short_description','full_description','specifications_text',
    'dealer_price_ex_vat','promotional_price_ex_vat','source_availability_raw',
    'brand_id','category_id','subcategory_id','model_number','part_number','supplier_sku',
    'screen_size','capacity','colour'];
  _clearable text[] := ARRAY['dealer_price_ex_vat','promotional_price_ex_vat'];
BEGIN
  IF NOT public.is_admin(_uid) THEN
    RAISE EXCEPTION 'Only administrators may apply catalogue imports';
  END IF;

  SELECT price_list INTO _list FROM public.catalogue_imports WHERE id = _import_id;
  SELECT markup_rate INTO _markup FROM public.pricing_settings ORDER BY created_at LIMIT 1;

  FOR r IN
    SELECT * FROM public.catalogue_import_rows
    WHERE import_id = _import_id AND decision = 'approved'
      AND change_type IN ('new','update','discontinued','missing')
    ORDER BY source_row_number
  LOOP
    BEGIN
      IF r.validation_error IS NOT NULL THEN
        CONTINUE;
      END IF;

      _dead := (r.change_type = 'discontinued');

      IF r.change_type = 'missing' THEN
        -- Not on the latest list: hide it (reversible via rollback).
        IF r.matched_product_id IS NULL THEN CONTINUE; END IF;
        INSERT INTO public.catalogue_change_log
          (import_id, row_id, product_id, action, old_value, applied_by)
        SELECT _import_id, r.id, p.id, 'hidden_missing',
               jsonb_build_object('is_published', p.is_published,
                                  'stock_status', p.stock_status::text,
                                  'source_availability_raw', p.source_availability_raw),
               _uid
          FROM public.products p WHERE p.id = r.matched_product_id;
        UPDATE public.products
           SET is_published = false, stock_status = 'out_of_stock', source_availability_raw = NULL
         WHERE id = r.matched_product_id;
        _hidden := _hidden + 1;

      ELSIF r.change_type = 'new' OR (_dead AND r.matched_product_id IS NULL) THEN
        _slug := left(regexp_replace(lower(coalesce(r.product_name, r.supplier_sku)), '[^a-z0-9]+', '-', 'g'), 70)
                 || '-' || left(replace(gen_random_uuid()::text, '-', ''), 6);
        INSERT INTO public.products (
          sku, name, slug, short_description, full_description,
          supplier_sku, model_number, part_number,
          brand_id, category_id,
          dealer_price_ex_vat, promotional_price_ex_vat, markup_rate,
          source_availability_raw, is_published, import_batch_id, last_seen_import_id, price_list,
          specifications_text, is_discontinued, stock_status, inventory_mode
        ) VALUES (
          r.supplier_sku, coalesce(r.product_name, r.supplier_sku), _slug,
          nullif(r.normalised->>'short_description',''), nullif(r.normalised->>'full_description',''),
          r.supplier_sku, r.model_number, r.part_number,
          nullif(r.proposed_changes->'brand_id'->>'new','')::uuid,
          nullif(r.proposed_changes->'category_id'->>'new','')::uuid,
          nullif(r.normalised->>'dealer_price_ex_vat','')::numeric,
          nullif(r.normalised->>'promotional_price_ex_vat','')::numeric,
          coalesce(_markup, 0.2000),
          nullif(r.normalised->>'availability_raw',''),
          false, _import_id, _import_id, _list,
          nullif(r.normalised->>'specifications_text',''),
          _dead,
          CASE WHEN _dead THEN 'discontinued'::stock_status ELSE 'awaiting_confirmation'::stock_status END,
          CASE WHEN _dead THEN 'discontinued'::inventory_mode ELSE 'supplier_confirmation'::inventory_mode END
        )
        RETURNING id INTO _pid;

        _created := _created + 1;
        INSERT INTO public.catalogue_change_log (import_id, row_id, product_id, action, applied_by)
        VALUES (_import_id, r.id, _pid, 'product_created', _uid);

      ELSIF r.matched_product_id IS NOT NULL THEN
        _pid := r.matched_product_id;

        -- Locked products are never changed by an import, even by an admin.
        IF EXISTS (SELECT 1 FROM public.products WHERE id = _pid AND review_locked) THEN
          UPDATE public.catalogue_import_rows
             SET decision = 'kept_existing',
                 review_reason = concat_ws(' ', review_reason, 'Product is locked for manual review; nothing was changed.')
           WHERE id = r.id;
          _locked := _locked + 1;
          CONTINUE;
        END IF;

        FOR _field, _new IN SELECT key, value FROM jsonb_each(r.proposed_changes)
        LOOP
          _old := _new->'old';
          CONTINUE WHEN NOT (_field = ANY(_allowed));

          IF _field = ANY(_clearable) AND jsonb_typeof(_new->'new') = 'null' THEN
            -- The list has no value for this price any more (e.g. a promo ended).
            EXECUTE format('UPDATE public.products SET %I = NULL, last_seen_import_id = $1 WHERE id = $2', _field)
              USING _import_id, _pid;
          ELSE
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
          END IF;

          INSERT INTO public.catalogue_change_log
            (import_id, row_id, product_id, action, field, old_value, new_value, applied_by)
          VALUES (_import_id, r.id, _pid, 'field_updated', _field, _old, _new->'new', _uid);
        END LOOP;

        IF _dead THEN
          INSERT INTO public.catalogue_change_log
            (import_id, row_id, product_id, action, old_value, applied_by)
          SELECT _import_id, r.id, _pid, 'marked_discontinued',
                 jsonb_build_object('is_discontinued', p.is_discontinued,
                                    'stock_status', p.stock_status::text,
                                    'inventory_mode', p.inventory_mode::text),
                 _uid
          FROM public.products p WHERE p.id = _pid;

          UPDATE public.products
            SET is_discontinued = true, stock_status = 'discontinued',
                inventory_mode = 'discontinued', last_seen_import_id = _import_id,
                price_list = coalesce(_list, price_list)
          WHERE id = _pid;
        ELSE
          UPDATE public.products
             SET last_seen_import_id = _import_id, price_list = coalesce(_list, price_list)
           WHERE id = _pid;
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

  RETURN jsonb_build_object('created', _created, 'updated', _updated, 'hidden', _hidden,
                            'locked_skipped', _locked, 'failed', _failed);
END;
$fn$;

-- Rollback also restores products hidden as "missing".
CREATE OR REPLACE FUNCTION public.rollback_catalogue_import(_import_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
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
    UPDATE public.products SET
      is_discontinued = coalesce((c.old_value->>'is_discontinued')::boolean, false),
      stock_status    = coalesce((c.old_value->>'stock_status')::stock_status, 'awaiting_confirmation'::stock_status),
      inventory_mode  = coalesce((c.old_value->>'inventory_mode')::inventory_mode, 'supplier_confirmation'::inventory_mode)
    WHERE id = c.product_id;
    _reverted := _reverted + 1;
  END LOOP;

  FOR c IN
    SELECT * FROM public.catalogue_change_log
    WHERE import_id = _import_id AND action = 'hidden_missing'
  LOOP
    UPDATE public.products SET
      source_availability_raw = c.old_value->>'source_availability_raw',
      stock_status = coalesce((c.old_value->>'stock_status')::stock_status, stock_status),
      is_published = coalesce((c.old_value->>'is_published')::boolean, is_published)
    WHERE id = c.product_id;
    _reverted := _reverted + 1;
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

  RETURN jsonb_build_object('fields_reverted', _reverted, 'products_deleted', _deleted,
                            'already_rolled_back', false);
END;
$fn$;

REVOKE ALL ON FUNCTION public.apply_catalogue_import(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rollback_catalogue_import(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.flag_absent_products(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.map_supplier_availability(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.map_supplier_availability(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_catalogue_import(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rollback_catalogue_import(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.flag_absent_products(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------
-- A7. "Process this file again" must be able to create a second batch.
-- The duplicate warning stays in application code.
-- ---------------------------------------------------------------------
DROP INDEX IF EXISTS public.catalogue_imports_checksum_idx;
CREATE INDEX IF NOT EXISTS catalogue_imports_checksum_lookup_idx
  ON public.catalogue_imports (file_checksum);

-- ---------------------------------------------------------------------
-- A1. Take the 18 seeded demo products off the shop (unpublish, not delete).
-- ---------------------------------------------------------------------
UPDATE public.products
   SET is_published = false
 WHERE sku LIKE 'TN-%' AND import_batch_id IS NULL AND source_type IS NULL;
