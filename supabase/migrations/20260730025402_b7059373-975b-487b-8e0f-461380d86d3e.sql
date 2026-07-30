ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS import_batch_id uuid REFERENCES public.catalogue_imports(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS import_status text,
  ADD COLUMN IF NOT EXISTS source_type text,
  ADD COLUMN IF NOT EXISTS source_workbook text,
  ADD COLUMN IF NOT EXISTS source_worksheet text,
  ADD COLUMN IF NOT EXISTS source_row_number integer,
  ADD COLUMN IF NOT EXISTS source_section text,
  ADD COLUMN IF NOT EXISTS source_availability_raw text,
  ADD COLUMN IF NOT EXISTS specifications_text text,
  ADD COLUMN IF NOT EXISTS brand_review_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS image_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_discontinued boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS products_sku_ci_key ON public.products (upper(sku));
CREATE INDEX IF NOT EXISTS products_import_batch_idx ON public.products (import_batch_id);

-- Anonymous shoppers may only read customer-facing columns.
REVOKE ALL ON public.products FROM anon;
GRANT SELECT (
  id, sku, name, slug, brand_id, category_id, subcategory_id,
  short_description, full_description, specifications_text,
  supplier_availability, stock_status, quantity, low_stock_threshold,
  selling_price_incl_vat, previous_price_incl_vat,
  screen_size, capacity, colour,
  is_featured, is_promotional, is_clearance, is_new_arrival, is_discontinued,
  is_published, seo_title, seo_description, created_at, updated_at
) ON public.products TO anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;