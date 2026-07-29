-- ENUMS
CREATE TYPE public.app_role AS ENUM ('super_admin','admin','catalogue_manager','order_manager','customer');
CREATE TYPE public.supplier_availability AS ENUM ('in_stock','low_stock','new_in_stock','eta','clearance','end_of_life','out_of_stock','unknown');
CREATE TYPE public.stock_status AS ENUM ('available','low_stock','awaiting_confirmation','preorder','out_of_stock','discontinued');
CREATE TYPE public.rounding_method AS ENUM ('exact','nearest_rand','nearest_ten','ends_99');
CREATE TYPE public.order_status AS ENUM ('new','awaiting_stock_confirmation','stock_confirmed','awaiting_payment','paid','processing','ready_for_dispatch','shipped','delivered','cancelled','refunded');
CREATE TYPE public.checkout_mode AS ENUM ('live_payment','manual_eft','request_order');
CREATE TYPE public.import_status AS ENUM ('pending','previewing','completed','failed','cancelled');

-- UTIL
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- PROFILES
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  email text,
  full_name text,
  phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ROLES
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id
    AND role IN ('super_admin','admin','catalogue_manager','order_manager'));
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id
    AND role IN ('super_admin','admin'));
$$;

CREATE POLICY "own profile read" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY "own profile write" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "roles read" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_staff(auth.uid()));

-- new user trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'customer')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- BRANDS
CREATE TABLE public.brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  slug text NOT NULL UNIQUE,
  logo_url text,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.brands TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.brands TO authenticated;
GRANT ALL ON public.brands TO service_role;
ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;
CREATE POLICY "brands public read" ON public.brands FOR SELECT USING (true);
CREATE POLICY "brands staff write" ON public.brands FOR ALL TO authenticated USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'catalogue_manager')) WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'catalogue_manager'));

-- CATEGORIES
CREATE TABLE public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  banner_url text,
  icon text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  seo_title text,
  seo_description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.categories TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT ALL ON public.categories TO service_role;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "categories public read" ON public.categories FOR SELECT USING (true);
CREATE POLICY "categories staff write" ON public.categories FOR ALL TO authenticated USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'catalogue_manager')) WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'catalogue_manager'));

-- PRICING SETTINGS
CREATE TABLE public.pricing_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  markup_rate numeric(6,4) NOT NULL DEFAULT 0.2000,
  vat_rate numeric(6,4) NOT NULL DEFAULT 0.1500,
  price_source text NOT NULL DEFAULT 'promotional_price',
  rounding public.rounding_method NOT NULL DEFAULT 'exact',
  auto_recalculate boolean NOT NULL DEFAULT true,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.pricing_settings TO authenticated;
GRANT ALL ON public.pricing_settings TO service_role;
ALTER TABLE public.pricing_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pricing settings staff" ON public.pricing_settings FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
INSERT INTO public.pricing_settings (markup_rate, vat_rate) VALUES (0.2000, 0.1500);

-- PRODUCTS
CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text NOT NULL UNIQUE,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  brand_id uuid REFERENCES public.brands(id) ON DELETE SET NULL,
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  subcategory_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  short_description text,
  full_description text,
  supplier_availability public.supplier_availability NOT NULL DEFAULT 'unknown',
  supplier_availability_note text,
  stock_status public.stock_status NOT NULL DEFAULT 'awaiting_confirmation',
  quantity integer,
  low_stock_threshold integer NOT NULL DEFAULT 3,
  promotional_price_ex_vat numeric(12,4),
  dealer_price_ex_vat numeric(12,4),
  markup_rate numeric(6,4) NOT NULL DEFAULT 0.2000,
  markup_amount numeric(12,2),
  selling_price_ex_vat numeric(12,2),
  vat_rate numeric(6,4) NOT NULL DEFAULT 0.1500,
  vat_amount numeric(12,2),
  selling_price_incl_vat numeric(12,2),
  previous_price_incl_vat numeric(12,2),
  manual_price_override numeric(12,2),
  override_reason text,
  override_by uuid,
  override_at timestamptz,
  pricing_review_required boolean NOT NULL DEFAULT true,
  screen_size text,
  capacity text,
  colour text,
  is_featured boolean NOT NULL DEFAULT false,
  is_promotional boolean NOT NULL DEFAULT false,
  is_clearance boolean NOT NULL DEFAULT false,
  is_new_arrival boolean NOT NULL DEFAULT false,
  is_published boolean NOT NULL DEFAULT false,
  seo_title text,
  seo_description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX products_category_idx ON public.products(category_id);
CREATE INDEX products_brand_idx ON public.products(brand_id);
CREATE INDEX products_published_idx ON public.products(is_published);
CREATE INDEX products_search_idx ON public.products USING gin (to_tsvector('english', coalesce(name,'') || ' ' || coalesce(sku,'') || ' ' || coalesce(short_description,'')));
GRANT SELECT ON public.products TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "products public read published" ON public.products FOR SELECT USING (is_published = true);
CREATE POLICY "products staff read all" ON public.products FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "products staff write" ON public.products FOR ALL TO authenticated USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'catalogue_manager')) WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'catalogue_manager'));

-- Pricing engine trigger
CREATE OR REPLACE FUNCTION public.apply_pricing()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE ex numeric(14,6); v numeric(14,6); base numeric(14,6); r public.rounding_method;
BEGIN
  SELECT rounding INTO r FROM public.pricing_settings ORDER BY created_at LIMIT 1;
  base := NEW.promotional_price_ex_vat;
  IF base IS NULL OR base <= 0 THEN
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
CREATE TRIGGER products_pricing BEFORE INSERT OR UPDATE OF promotional_price_ex_vat, markup_rate, vat_rate ON public.products
FOR EACH ROW EXECUTE FUNCTION public.apply_pricing();
CREATE TRIGGER products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- IMAGES / SPECS
CREATE TABLE public.product_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  url text NOT NULL,
  alt_text text,
  sort_order integer NOT NULL DEFAULT 0,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.product_images TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.product_images TO authenticated;
GRANT ALL ON public.product_images TO service_role;
ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY "images public read" ON public.product_images FOR SELECT USING (true);
CREATE POLICY "images staff write" ON public.product_images FOR ALL TO authenticated USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'catalogue_manager')) WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'catalogue_manager'));

CREATE TABLE public.product_specifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  spec_key text NOT NULL,
  spec_value text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0
);
GRANT SELECT ON public.product_specifications TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.product_specifications TO authenticated;
GRANT ALL ON public.product_specifications TO service_role;
ALTER TABLE public.product_specifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "specs public read" ON public.product_specifications FOR SELECT USING (true);
CREATE POLICY "specs staff write" ON public.product_specifications FOR ALL TO authenticated USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'catalogue_manager')) WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'catalogue_manager'));

-- PRICING AUDIT
CREATE TABLE public.pricing_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  action text NOT NULL,
  old_values jsonb,
  new_values jsonb,
  changed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.pricing_audit_log TO authenticated;
GRANT ALL ON public.pricing_audit_log TO service_role;
ALTER TABLE public.pricing_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit staff read" ON public.pricing_audit_log FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "audit staff insert" ON public.pricing_audit_log FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));

-- IMPORTS
CREATE TABLE public.catalogue_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name text NOT NULL,
  imported_by uuid,
  status public.import_status NOT NULL DEFAULT 'pending',
  total_rows integer NOT NULL DEFAULT 0,
  created_count integer NOT NULL DEFAULT 0,
  updated_count integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0,
  summary jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.catalogue_imports TO authenticated;
GRANT ALL ON public.catalogue_imports TO service_role;
ALTER TABLE public.catalogue_imports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "imports staff" ON public.catalogue_imports FOR ALL TO authenticated USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'catalogue_manager')) WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'catalogue_manager'));

CREATE TABLE public.catalogue_import_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id uuid NOT NULL REFERENCES public.catalogue_imports(id) ON DELETE CASCADE,
  row_number integer,
  product_code text,
  error_type text NOT NULL,
  message text NOT NULL,
  raw_row jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.catalogue_import_errors TO authenticated;
GRANT ALL ON public.catalogue_import_errors TO service_role;
ALTER TABLE public.catalogue_import_errors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "import errors staff" ON public.catalogue_import_errors FOR ALL TO authenticated USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'catalogue_manager')) WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'catalogue_manager'));

-- ADDRESSES
CREATE TABLE public.addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  label text,
  recipient_name text NOT NULL,
  phone text,
  line1 text NOT NULL,
  line2 text,
  suburb text,
  city text NOT NULL,
  province text NOT NULL,
  postal_code text NOT NULL,
  country text NOT NULL DEFAULT 'South Africa',
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.addresses TO authenticated;
GRANT ALL ON public.addresses TO service_role;
ALTER TABLE public.addresses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own addresses" ON public.addresses FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "staff read addresses" ON public.addresses FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

-- WISHLIST
CREATE TABLE public.wishlist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, product_id)
);
GRANT SELECT, INSERT, DELETE ON public.wishlist_items TO authenticated;
GRANT ALL ON public.wishlist_items TO service_role;
ALTER TABLE public.wishlist_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own wishlist" ON public.wishlist_items FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- CART
CREATE TABLE public.carts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.carts TO authenticated;
GRANT ALL ON public.carts TO service_role;
ALTER TABLE public.carts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own cart" ON public.carts FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.cart_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id uuid NOT NULL REFERENCES public.carts(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cart_id, product_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cart_items TO authenticated;
GRANT ALL ON public.cart_items TO service_role;
ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own cart items" ON public.cart_items FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.carts c WHERE c.id = cart_id AND c.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.carts c WHERE c.id = cart_id AND c.user_id = auth.uid()));

-- ORDERS
CREATE SEQUENCE public.order_number_seq START 1000;
CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL UNIQUE DEFAULT ('TN-' || nextval('public.order_number_seq')),
  user_id uuid,
  contact_name text NOT NULL,
  contact_email text NOT NULL,
  contact_phone text,
  delivery_address jsonb,
  delivery_method text,
  delivery_fee numeric(12,2) NOT NULL DEFAULT 0,
  subtotal_incl_vat numeric(12,2) NOT NULL DEFAULT 0,
  vat_amount numeric(12,2) NOT NULL DEFAULT 0,
  total_incl_vat numeric(12,2) NOT NULL DEFAULT 0,
  payment_method text,
  payment_status text NOT NULL DEFAULT 'unpaid',
  status public.order_status NOT NULL DEFAULT 'new',
  customer_notes text,
  admin_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own orders read" ON public.orders FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY "own orders insert" ON public.orders FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "staff orders update" ON public.orders FOR UPDATE TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE TRIGGER orders_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  sku text NOT NULL,
  name text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price_incl_vat numeric(12,2) NOT NULL,
  line_total_incl_vat numeric(12,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.order_items TO authenticated;
GRANT ALL ON public.order_items TO service_role;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "order items read" ON public.order_items FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND (o.user_id = auth.uid() OR public.is_staff(auth.uid()))));
CREATE POLICY "order items insert" ON public.order_items FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.user_id = auth.uid()));

CREATE TABLE public.order_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  status public.order_status NOT NULL,
  note text,
  changed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.order_status_history TO authenticated;
GRANT ALL ON public.order_status_history TO service_role;
ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "status history read" ON public.order_status_history FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND (o.user_id = auth.uid() OR public.is_staff(auth.uid()))));
CREATE POLICY "status history insert" ON public.order_status_history FOR INSERT TO authenticated
WITH CHECK (public.is_staff(auth.uid()) OR EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.user_id = auth.uid()));

-- SITE SETTINGS
CREATE TABLE public.site_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checkout_mode public.checkout_mode NOT NULL DEFAULT 'request_order',
  store_email text NOT NULL DEFAULT 'sales@technest.co.za',
  store_phone text NOT NULL DEFAULT '+27 00 000 0000',
  whatsapp_number text NOT NULL DEFAULT '',
  eft_details text,
  delivery_note text NOT NULL DEFAULT 'Nationwide delivery available. Delivery is quoted after stock confirmation.',
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.site_settings TO anon, authenticated;
GRANT INSERT, UPDATE ON public.site_settings TO authenticated;
GRANT ALL ON public.site_settings TO service_role;
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settings public read" ON public.site_settings FOR SELECT USING (true);
CREATE POLICY "settings admin write" ON public.site_settings FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
INSERT INTO public.site_settings DEFAULT VALUES;