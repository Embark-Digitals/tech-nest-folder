-- =====================================================================
-- Thola Something / TechNest — DB batch 2: admin order screen
-- Prepared 2026-11-12, reviewed 2026-11-13. Run in the Lovable Cloud SQL editor
-- (no Lovable agent). A copy is committed to supabase/migrations as the record. Backward compatible with the frontend live on main (0d96567):
-- set_order_status keeps its signature; tables and columns are additive.
-- =====================================================================

-- ---------------------------------------------------------------------
-- B3. Refund bookkeeping columns (written only by record_refund)
-- ---------------------------------------------------------------------
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS refunded_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS refund_reference text,
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz,
  ADD COLUMN IF NOT EXISTS refunded_by uuid;

-- ---------------------------------------------------------------------
-- B3. Status workflow: "paid first" (founder decision)
--  * "paid" can only be set by the payment routines (confirm_manual_eft,
--    mark_order_paid), never from the status dropdown.
--  * Nothing moves to processing / dispatch / delivery until a payment is
--    recorded.
--  * "refunded" only through record_refund (below).
-- ---------------------------------------------------------------------
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

  IF _status = 'paid' THEN
    RAISE EXCEPTION 'Use "Record payment" to mark an order as paid';
  END IF;
  IF _status = 'refunded' THEN
    RAISE EXCEPTION 'Use "Record refund" to refund an order';
  END IF;

  allowed := CASE ord.status
    WHEN 'new' THEN ARRAY['awaiting_stock_confirmation','stock_confirmed','awaiting_payment','cancelled']
    WHEN 'awaiting_stock_confirmation' THEN ARRAY['stock_confirmed','cancelled']
    WHEN 'stock_confirmed' THEN ARRAY['awaiting_payment','processing','cancelled']
    WHEN 'awaiting_payment' THEN ARRAY['processing','cancelled']
    WHEN 'paid' THEN ARRAY['processing','cancelled']
    WHEN 'processing' THEN ARRAY['ready_for_dispatch','ready_for_collection','cancelled']
    WHEN 'ready_for_dispatch' THEN ARRAY['shipped','cancelled']
    WHEN 'ready_for_collection' THEN ARRAY['delivered','cancelled']
    WHEN 'shipped' THEN ARRAY['delivered','cancelled']
    ELSE ARRAY[]::text[]
  END::public.order_status[];

  IF NOT (_status = ANY (allowed)) THEN
    RAISE EXCEPTION 'Cannot move order from % to %', ord.status, _status;
  END IF;

  IF _status IN ('processing','ready_for_dispatch','ready_for_collection','shipped','delivered')
     AND coalesce(ord.payment_status, 'unpaid') <> 'paid' THEN
    RAISE EXCEPTION 'Record the payment before moving this order to %', _status;
  END IF;

  PERFORM set_config('app.order_workflow', 'on', true);
  UPDATE public.orders SET status = _status WHERE id = _order_id RETURNING * INTO ord;

  IF _status = 'cancelled' THEN
    PERFORM public.release_order_stock(_order_id);
  END IF;

  INSERT INTO public.order_status_history (order_id, status, note, changed_by)
  VALUES (_order_id, _status, nullif(left(coalesce(_note,''),500),''), actor);
  PERFORM set_config('app.order_workflow', 'off', true);

  RETURN jsonb_build_object('id', ord.id, 'status', ord.status, 'changed', true);
END; $$;

-- ---------------------------------------------------------------------
-- B3. Record a refund (admin only). Full refund -> status "refunded".
-- Partial refund -> payment_status "partially_refunded", status unchanged.
-- Allowed after cancellation (e.g. Atlas cannot supply) or after delivery
-- (a return).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_refund(
  _order_id uuid, _amount_incl_vat numeric, _reference text, _note text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE actor uuid := auth.uid(); ord public.orders%ROWTYPE; _full boolean;
BEGIN
  IF actor IS NULL OR NOT public.is_admin(actor) THEN
    RAISE EXCEPTION 'Only administrators may record refunds';
  END IF;
  IF _reference IS NULL OR length(btrim(_reference)) < 3 THEN
    RAISE EXCEPTION 'A refund reference is required';
  END IF;

  SELECT * INTO ord FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF ord.payment_status <> 'paid' THEN
    RAISE EXCEPTION 'Only a paid order can be refunded (payment status is %)', ord.payment_status;
  END IF;
  IF ord.status NOT IN ('cancelled','delivered') THEN
    RAISE EXCEPTION 'Cancel the order (or wait for delivery and a return) before refunding';
  END IF;
  IF _amount_incl_vat IS NULL OR _amount_incl_vat <= 0 OR round(_amount_incl_vat,2) > ord.total_incl_vat THEN
    RAISE EXCEPTION 'Refund amount must be more than R0 and no more than the order total';
  END IF;

  _full := round(_amount_incl_vat,2) = ord.total_incl_vat;

  PERFORM set_config('app.order_workflow', 'on', true);
  UPDATE public.orders SET
    payment_status = CASE WHEN _full THEN 'refunded' ELSE 'partially_refunded' END,
    status = CASE WHEN _full THEN 'refunded'::public.order_status ELSE status END,
    refunded_amount = round(_amount_incl_vat,2),
    refund_reference = btrim(_reference),
    refunded_at = now(),
    refunded_by = actor
  WHERE id = _order_id RETURNING * INTO ord;

  IF _full THEN
    PERFORM public.release_order_stock(_order_id);
  END IF;

  INSERT INTO public.order_status_history (order_id, status, note, changed_by)
  VALUES (ord.id, ord.status,
          left(concat_ws(' · ',
               CASE WHEN _full THEN 'Refunded in full' ELSE 'Partial refund' END
                 || ' R' || to_char(round(_amount_incl_vat,2), 'FM999999990.00')
                 || ', ref ' || btrim(_reference),
               nullif(btrim(coalesce(_note,'')),'')), 500),
          actor);
  PERFORM set_config('app.order_workflow', 'off', true);

  RETURN jsonb_build_object('id', ord.id, 'status', ord.status, 'payment_status', ord.payment_status,
                            'refunded_amount', ord.refunded_amount);
END; $fn$;

REVOKE ALL ON FUNCTION public.record_refund(uuid, numeric, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_refund(uuid, numeric, text, text) TO authenticated;

-- Refund columns join the payment fields that only routines may write.
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
     OR NEW.payment_confirmed_at IS DISTINCT FROM OLD.payment_confirmed_at
     OR NEW.refunded_amount IS DISTINCT FROM OLD.refunded_amount
     OR NEW.refund_reference IS DISTINCT FROM OLD.refund_reference
     OR NEW.refunded_at IS DISTINCT FROM OLD.refunded_at
     OR NEW.refunded_by IS DISTINCT FROM OLD.refunded_by THEN
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

-- ---------------------------------------------------------------------
-- B4. The Atlas leg: supplier references and tracking (staff)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.order_fulfilment (
  order_id uuid PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
  supplier text NOT NULL DEFAULT 'Atlas' CHECK (length(supplier) <= 120),
  supplier_order_ref text CHECK (length(supplier_order_ref) <= 120),
  supplier_invoice_ref text CHECK (length(supplier_invoice_ref) <= 120),
  ordered_with_supplier_at timestamptz,
  courier text CHECK (length(courier) <= 120),
  tracking_number text CHECK (length(tracking_number) <= 120),
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.order_fulfilment TO authenticated;
GRANT ALL ON public.order_fulfilment TO service_role;
ALTER TABLE public.order_fulfilment ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff read fulfilment" ON public.order_fulfilment;
DROP POLICY IF EXISTS "staff insert fulfilment" ON public.order_fulfilment;
DROP POLICY IF EXISTS "staff update fulfilment" ON public.order_fulfilment;
CREATE POLICY "staff read fulfilment" ON public.order_fulfilment
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "staff insert fulfilment" ON public.order_fulfilment
  FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "staff update fulfilment" ON public.order_fulfilment
  FOR UPDATE TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
DROP TRIGGER IF EXISTS order_fulfilment_updated_at ON public.order_fulfilment;
CREATE TRIGGER order_fulfilment_updated_at BEFORE UPDATE ON public.order_fulfilment
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------
-- B4. Supplier cost per order line — ADMIN ONLY.
-- Deliberately NOT a column on order_items (customers can read their own
-- order_items), so supplier costs are not exposed further (SEC-001A).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.order_item_costs (
  order_item_id uuid PRIMARY KEY REFERENCES public.order_items(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  expected_unit_cost_ex_vat numeric(12,2),
  actual_unit_cost_ex_vat numeric(12,2) CHECK (actual_unit_cost_ex_vat IS NULL OR actual_unit_cost_ex_vat >= 0),
  cost_source text NOT NULL DEFAULT 'snapshot' CHECK (cost_source IN ('snapshot','estimated_backfill')),
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS order_item_costs_order_idx ON public.order_item_costs (order_id);
GRANT SELECT, UPDATE ON public.order_item_costs TO authenticated;
GRANT ALL ON public.order_item_costs TO service_role;
ALTER TABLE public.order_item_costs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins read item costs" ON public.order_item_costs;
DROP POLICY IF EXISTS "admins update item costs" ON public.order_item_costs;
CREATE POLICY "admins read item costs" ON public.order_item_costs
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "admins update item costs" ON public.order_item_costs
  FOR UPDATE TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
DROP TRIGGER IF EXISTS order_item_costs_updated_at ON public.order_item_costs;
CREATE TRIGGER order_item_costs_updated_at BEFORE UPDATE ON public.order_item_costs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Only the actual cost may be edited; the snapshot is evidence.
CREATE OR REPLACE FUNCTION public.protect_order_item_costs()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.order_item_id IS DISTINCT FROM OLD.order_item_id
     OR NEW.order_id IS DISTINCT FROM OLD.order_id
     OR NEW.expected_unit_cost_ex_vat IS DISTINCT FROM OLD.expected_unit_cost_ex_vat
     OR NEW.cost_source IS DISTINCT FROM OLD.cost_source THEN
    RAISE EXCEPTION 'Only the actual unit cost can be edited';
  END IF;
  NEW.updated_by := auth.uid();
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_protect_order_item_costs ON public.order_item_costs;
CREATE TRIGGER trg_protect_order_item_costs BEFORE UPDATE ON public.order_item_costs
  FOR EACH ROW EXECUTE FUNCTION public.protect_order_item_costs();

-- Snapshot the cost base (promo, else dealer) when an order line is created.
-- place_order is NOT modified; this never raises, so checkout cannot break.
CREATE OR REPLACE FUNCTION public.snapshot_order_item_cost()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN
    INSERT INTO public.order_item_costs (order_item_id, order_id, expected_unit_cost_ex_vat, cost_source)
    SELECT NEW.id, NEW.order_id,
           (SELECT CASE WHEN p.promotional_price_ex_vat > 0 THEN p.promotional_price_ex_vat
                        WHEN p.dealer_price_ex_vat > 0 THEN p.dealer_price_ex_vat END
              FROM public.products p WHERE p.id = NEW.product_id),
           'snapshot'
    ON CONFLICT (order_item_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'order_item_costs snapshot skipped for %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.snapshot_order_item_cost() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_order_items_cost_snapshot ON public.order_items;
CREATE TRIGGER trg_order_items_cost_snapshot AFTER INSERT ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.snapshot_order_item_cost();

-- Backfill existing order lines from today's costs, marked as estimates.
INSERT INTO public.order_item_costs (order_item_id, order_id, expected_unit_cost_ex_vat, cost_source)
SELECT i.id, i.order_id,
       CASE WHEN p.promotional_price_ex_vat > 0 THEN p.promotional_price_ex_vat
            WHEN p.dealer_price_ex_vat > 0 THEN p.dealer_price_ex_vat END,
       'estimated_backfill'
  FROM public.order_items i
  LEFT JOIN public.products p ON p.id = i.product_id
ON CONFLICT (order_item_id) DO NOTHING;
