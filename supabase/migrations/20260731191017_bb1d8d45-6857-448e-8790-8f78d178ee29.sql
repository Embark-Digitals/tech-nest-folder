-- =========================================================
-- EMAIL EVENT / DELIVERY LOG
-- =========================================================
CREATE TYPE public.email_status AS ENUM ('pending','sent','failed','skipped_duplicate','suppressed');

CREATE TABLE public.email_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  recipient text NOT NULL,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  dedupe_key text NOT NULL,
  provider_message_id text,
  status public.email_status NOT NULL DEFAULT 'pending',
  failure_reason text,
  retry_count integer NOT NULL DEFAULT 0,
  attempted_at timestamptz,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_test boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX email_events_dedupe_key_idx ON public.email_events (dedupe_key);
CREATE INDEX email_events_order_idx ON public.email_events (order_id);
CREATE INDEX email_events_status_idx ON public.email_events (status, created_at DESC);

GRANT SELECT ON public.email_events TO authenticated;
GRANT ALL ON public.email_events TO service_role;
ALTER TABLE public.email_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff read email events" ON public.email_events
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

CREATE TRIGGER email_events_updated_at BEFORE UPDATE ON public.email_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- SUPPLIER CATALOGUE UPDATE SYSTEM
-- =========================================================
ALTER TABLE public.catalogue_imports
  ADD COLUMN IF NOT EXISTS supplier text,
  ADD COLUMN IF NOT EXISTS original_filename text,
  ADD COLUMN IF NOT EXISTS file_checksum text,
  ADD COLUMN IF NOT EXISTS storage_path text,
  ADD COLUMN IF NOT EXISTS catalogue_date date,
  ADD COLUMN IF NOT EXISTS parser_version text,
  ADD COLUMN IF NOT EXISTS extraction_method text,
  ADD COLUMN IF NOT EXISTS pricing_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS rows_examined integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rejected_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS review_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS catalogue_imports_checksum_idx
  ON public.catalogue_imports (file_checksum) WHERE file_checksum IS NOT NULL;

CREATE TYPE public.import_change_type AS ENUM (
  'new','update','unchanged','missing','discontinued','ambiguous','error','ignored'
);
CREATE TYPE public.import_confidence AS ENUM ('high','medium','low','manual_review');
CREATE TYPE public.import_decision AS ENUM ('pending','approved','rejected','kept_existing','applied','failed');

CREATE TABLE public.catalogue_import_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id uuid NOT NULL REFERENCES public.catalogue_imports(id) ON DELETE CASCADE,
  source_worksheet text,
  source_page integer,
  source_row_number integer,
  source_section text,
  supplier_sku text,
  model_number text,
  part_number text,
  product_name text,
  raw_row jsonb NOT NULL DEFAULT '{}'::jsonb,
  normalised jsonb NOT NULL DEFAULT '{}'::jsonb,
  matched_product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  match_method text,
  match_reason text,
  match_confidence numeric(5,2),
  confidence_band public.import_confidence NOT NULL DEFAULT 'manual_review',
  ai_assisted boolean NOT NULL DEFAULT false,
  ai_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  change_type public.import_change_type NOT NULL DEFAULT 'error',
  proposed_changes jsonb NOT NULL DEFAULT '{}'::jsonb,
  computed_price_incl_vat numeric(12,2),
  validation_error text,
  review_reason text,
  decision public.import_decision NOT NULL DEFAULT 'pending',
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX catalogue_import_rows_import_idx ON public.catalogue_import_rows (import_id, change_type);
CREATE INDEX catalogue_import_rows_decision_idx ON public.catalogue_import_rows (import_id, decision);
CREATE INDEX catalogue_import_rows_product_idx ON public.catalogue_import_rows (matched_product_id);

GRANT SELECT, UPDATE ON public.catalogue_import_rows TO authenticated;
GRANT ALL ON public.catalogue_import_rows TO service_role;
ALTER TABLE public.catalogue_import_rows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff read import rows" ON public.catalogue_import_rows
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "admins decide import rows" ON public.catalogue_import_rows
  FOR UPDATE TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE TRIGGER catalogue_import_rows_updated_at BEFORE UPDATE ON public.catalogue_import_rows
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.catalogue_change_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id uuid REFERENCES public.catalogue_imports(id) ON DELETE CASCADE,
  row_id uuid REFERENCES public.catalogue_import_rows(id) ON DELETE SET NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  action text NOT NULL,
  field text,
  old_value jsonb,
  new_value jsonb,
  applied_by uuid,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX catalogue_change_log_import_idx ON public.catalogue_change_log (import_id);
CREATE INDEX catalogue_change_log_product_idx ON public.catalogue_change_log (product_id);

GRANT SELECT ON public.catalogue_change_log TO authenticated;
GRANT ALL ON public.catalogue_change_log TO service_role;
ALTER TABLE public.catalogue_change_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff read change log" ON public.catalogue_change_log
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

-- Products: mark absence-from-catalogue for review without unpublishing
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS catalogue_review_reason text,
  ADD COLUMN IF NOT EXISTS last_seen_import_id uuid,
  ADD COLUMN IF NOT EXISTS supplier_sku text,
  ADD COLUMN IF NOT EXISTS model_number text,
  ADD COLUMN IF NOT EXISTS part_number text,
  ADD COLUMN IF NOT EXISTS brand_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS category_verified boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS products_supplier_sku_idx ON public.products (supplier_sku);
CREATE INDEX IF NOT EXISTS products_model_number_idx ON public.products (model_number);