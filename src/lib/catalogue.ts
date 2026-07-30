import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const PRODUCT_FIELDS =
  "id, sku, name, slug, short_description, full_description, stock_status, supplier_availability, quantity, selling_price_incl_vat, previous_price_incl_vat, is_featured, is_promotional, is_clearance, is_new_arrival, screen_size, capacity, colour, seo_title, seo_description, category_id, brand_id, brands(name, slug), categories!products_category_id_fkey(name, slug), product_images(url, alt_text, is_primary, sort_order)";

export type ProductRow = {
  id: string;
  sku: string;
  name: string;
  slug: string;
  short_description: string | null;
  full_description: string | null;
  stock_status: string;
  supplier_availability: string;
  quantity: number | null;
  selling_price_incl_vat: number | null;
  previous_price_incl_vat: number | null;
  is_featured: boolean;
  is_promotional: boolean;
  is_clearance: boolean;
  is_new_arrival: boolean;
  screen_size: string | null;
  capacity: string | null;
  colour: string | null;
  seo_title: string | null;
  seo_description: string | null;
  category_id: string | null;
  brand_id: string | null;
  brands: { name: string; slug: string } | null;
  categories: { name: string; slug: string } | null;
  product_images: { url: string; alt_text: string | null; is_primary: boolean; sort_order: number }[];
};

export function primaryImage(product: Pick<ProductRow, "product_images">) {
  const images = [...(product.product_images ?? [])].sort(
    (a, b) => Number(b.is_primary) - Number(a.is_primary) || a.sort_order - b.sort_order,
  );
  return images[0]?.url ?? null;
}

export type ShopFilters = {
  search?: string;
  category?: string;
  brand?: string;
  sort?: string;
  min?: number;
  max?: number;
};

export const categoriesQuery = queryOptions({
  queryKey: ["categories"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("categories")
      .select("id, name, slug, description, icon, sort_order")
      .eq("is_active", true)
      .order("sort_order");
    if (error) throw error;
    return data;
  },
});

export const brandsQuery = queryOptions({
  queryKey: ["brands"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("brands")
      .select("id, name, slug")
      .eq("is_active", true)
      .order("name");
    if (error) throw error;
    return data;
  },
});

export function productsQuery(filters: ShopFilters = {}) {
  return queryOptions({
    queryKey: ["products", filters],
    queryFn: async () => {
      let query = supabase.from("products").select(PRODUCT_FIELDS).eq("is_published", true);

      if (filters.search) query = query.ilike("name", `%${filters.search}%`);
      if (filters.min !== undefined) query = query.gte("selling_price_incl_vat", filters.min);
      if (filters.max !== undefined) query = query.lte("selling_price_incl_vat", filters.max);

      if (filters.sort === "price_asc") query = query.order("selling_price_incl_vat", { ascending: true });
      else if (filters.sort === "price_desc")
        query = query.order("selling_price_incl_vat", { ascending: false });
      else if (filters.sort === "name") query = query.order("name");
      else query = query.order("created_at", { ascending: false });

      const { data, error } = await query.limit(200);
      if (error) throw error;

      let rows = (data ?? []) as unknown as ProductRow[];
      if (filters.category) rows = rows.filter((p) => p.categories?.slug === filters.category);
      if (filters.brand) rows = rows.filter((p) => p.brands?.slug === filters.brand);
      return rows;
    },
  });
}

export function productQuery(slug: string) {
  return queryOptions({
    queryKey: ["product", slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select(`${PRODUCT_FIELDS}, product_specifications(spec_key, spec_value, sort_order)`)
        .eq("slug", slug)
        .eq("is_published", true)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as
        | (ProductRow & { product_specifications: { spec_key: string; spec_value: string; sort_order: number }[] })
        | null;
    },
  });
}

export const siteSettingsQuery = queryOptions({
  queryKey: ["site-settings"],
  queryFn: async () => {
    const { data, error } = await supabase.from("site_settings").select("*").limit(1).maybeSingle();
    if (error) throw error;
    return data;
  },
});
