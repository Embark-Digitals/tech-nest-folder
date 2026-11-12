import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const productFields = (opts: { innerCategory?: boolean; innerBrand?: boolean } = {}) =>
  "id, sku, name, slug, short_description, full_description, stock_status, supplier_availability, quantity, selling_price_incl_vat, previous_price_incl_vat, is_featured, is_promotional, is_clearance, is_new_arrival, is_discontinued, screen_size, capacity, colour, seo_title, seo_description, category_id, brand_id, " +
  `brands${opts.innerBrand ? "!inner" : ""}(name, slug), ` +
  `categories!products_category_id_fkey${opts.innerCategory ? "!inner" : ""}(name, slug), ` +
  "product_images(url, alt_text, is_primary, sort_order)";
const PRODUCT_FIELDS = productFields();

/** Products are listed in pages of this size; "Load more" asks for the next page. */
export const PAGE_SIZE = 48;

/** Can this product go in the cart? Coming-soon (pre-order) items can; unavailable ones cannot. */
export function isBuyable(
  p: Pick<ProductRow, "selling_price_incl_vat" | "stock_status" | "is_discontinued">,
) {
  return (
    Number(p.selling_price_incl_vat ?? 0) > 0 &&
    !p.is_discontinued &&
    p.stock_status !== "out_of_stock" &&
    p.stock_status !== "discontinued"
  );
}

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
  is_discontinued: boolean;
  screen_size: string | null;
  capacity: string | null;
  colour: string | null;
  seo_title: string | null;
  seo_description: string | null;
  category_id: string | null;
  brand_id: string | null;
  brands: { name: string; slug: string } | null;
  categories: { name: string; slug: string } | null;
  product_images: {
    url: string;
    alt_text: string | null;
    is_primary: boolean;
    sort_order: number;
  }[];
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
  /** Home-page sections. */
  flag?: "is_featured" | "is_promotional" | "is_new_arrival";
  /** How many products to return (defaults to one page). */
  limit?: number;
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

/**
 * Published, still-sold products. Category, brand and section filters run in
 * the database (not on a capped first page), and `total` is the full count so
 * the shop can offer "Load more".
 */
export function productsQuery(filters: ShopFilters = {}) {
  return queryOptions({
    queryKey: ["products", filters],
    queryFn: async () => {
      const limit = Math.max(1, Math.min(filters.limit ?? PAGE_SIZE, 1000));
      let query = supabase
        .from("products")
        .select(productFields({ innerCategory: !!filters.category, innerBrand: !!filters.brand }), {
          count: "exact",
        })
        .eq("is_published", true)
        .eq("is_discontinued", false)
        .neq("stock_status", "discontinued");

      if (filters.category) query = query.eq("categories.slug", filters.category);
      if (filters.brand) query = query.eq("brands.slug", filters.brand);
      if (filters.flag) query = query.eq(filters.flag, true);
      if (filters.search)
        query = query.ilike("name", `%${filters.search.replace(/[%_,()]/g, " ")}%`);
      if (filters.min !== undefined) query = query.gte("selling_price_incl_vat", filters.min);
      if (filters.max !== undefined) query = query.lte("selling_price_incl_vat", filters.max);

      if (filters.sort === "price_asc")
        query = query.order("selling_price_incl_vat", { ascending: true });
      else if (filters.sort === "price_desc")
        query = query.order("selling_price_incl_vat", { ascending: false });
      else if (filters.sort === "name") query = query.order("name");
      else query = query.order("created_at", { ascending: false });
      // stable paging when many rows share a sort value
      query = query.order("id");

      const { data, error, count } = await query.range(0, limit - 1);
      if (error) throw error;
      const rows = (data ?? []) as unknown as ProductRow[];
      return { rows, total: count ?? rows.length };
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
        | (ProductRow & {
            product_specifications: { spec_key: string; spec_value: string; sort_order: number }[];
          })
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
