-- 1. Business information fields on site_settings
ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS registered_business_name text,
  ADD COLUMN IF NOT EXISTS trading_name text,
  ADD COLUMN IF NOT EXISTS legal_status text,
  ADD COLUMN IF NOT EXISTS company_registration_number text,
  ADD COLUMN IF NOT EXISTS place_of_registration text,
  ADD COLUMN IF NOT EXISTS physical_address text,
  ADD COLUMN IF NOT EXISTS legal_service_address text,
  ADD COLUMN IF NOT EXISTS telephone_number text,
  ADD COLUMN IF NOT EXISTS office_bearers text,
  ADD COLUMN IF NOT EXISTS website_url text,
  ADD COLUMN IF NOT EXISTS support_email text,
  ADD COLUMN IF NOT EXISTS order_email text,
  ADD COLUMN IF NOT EXISTS collection_hours text,
  ADD COLUMN IF NOT EXISTS legal_review_status text NOT NULL DEFAULT 'incomplete',
  ADD COLUMN IF NOT EXISTS legal_last_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS legal_reviewed_by uuid;

-- Remove the placeholder phone number; keep nothing fabricated.
UPDATE public.site_settings
   SET store_phone = '', whatsapp_number = ''
 WHERE store_phone ~ '0{4,}' OR store_phone IS NULL;

-- 2. Catalogue review safeguards
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS supplier_price_anomaly boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS review_locked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS spec_review_required boolean NOT NULL DEFAULT false;

UPDATE public.products
   SET supplier_price_anomaly = true, review_locked = true
 WHERE sku = 'Kelon K12INKH';

UPDATE public.products p
   SET spec_review_required = true
 WHERE NOT EXISTS (SELECT 1 FROM public.product_specifications s WHERE s.product_id = p.id);

-- Locked products may not be silently republished or repriced by imports.
CREATE OR REPLACE FUNCTION public.guard_locked_products()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.review_locked AND NEW.review_locked THEN
    IF auth.uid() IS NULL OR NOT public.is_admin(auth.uid()) THEN
      NEW.dealer_price_ex_vat := OLD.dealer_price_ex_vat;
      NEW.promotional_price_ex_vat := OLD.promotional_price_ex_vat;
      NEW.is_published := OLD.is_published;
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_guard_locked_products ON public.products;
CREATE TRIGGER trg_guard_locked_products
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.guard_locked_products();

-- 3. Collection cannot be enabled without a real collection address
CREATE OR REPLACE FUNCTION public.validate_collection_settings()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.collection_enabled THEN
    IF NEW.collection_address IS NULL
       OR length(btrim(NEW.collection_address)) < 15
       OR NEW.collection_address !~ '[0-9]'
       OR NEW.collection_address ~* '(123 Business|Collection Point, Gauteng$|placeholder|TBC)' THEN
      RAISE EXCEPTION 'Collection cannot be enabled until a complete street collection address is captured';
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_validate_collection_settings ON public.shipping_settings;
CREATE TRIGGER trg_validate_collection_settings
  BEFORE INSERT OR UPDATE ON public.shipping_settings
  FOR EACH ROW EXECUTE FUNCTION public.validate_collection_settings();

-- Disable collection now, since the current address is a placeholder.
UPDATE public.shipping_settings
   SET collection_enabled = false,
       collection_address = '',
       collection_instructions = 'Collection is not available yet. It will be enabled once our collection address and operating hours are confirmed.';