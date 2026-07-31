import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type DeliveryClass =
  | "standard"
  | "fragile"
  | "oversized"
  | "heavy"
  | "supplier_confirmation"
  | "collection_only";

export const DELIVERY_CLASS_LABELS: Record<DeliveryClass, string> = {
  standard: "Standard",
  fragile: "Fragile",
  oversized: "Oversized",
  heavy: "Heavy",
  supplier_confirmation: "Supplier confirmation",
  collection_only: "Collection only",
};

export type DeliveryMethod = "courier" | "collection";

export type DeliveryQuote = {
  eligible: boolean;
  reason?: string;
  message?: string;
  method?: string;
  requires_manual_quote?: boolean;
  province?: string;
  province_name?: string;
  zone_id?: string | null;
  zone_name?: string;
  base_fee?: number;
  free_delivery_applied?: boolean;
  free_delivery_threshold?: number | null;
  surcharges?: { label: string; amount: number }[];
  surcharge_total?: number;
  delivery_fee: number;
  estimate?: string;
  remote?: boolean;
  subtotal_incl_vat?: number;
  total_incl_vat?: number;
  collection_available?: boolean;
  manual_quote_available?: boolean;
  collection_address?: string;
  collection_instructions?: string;
};

export type QuoteInput = {
  province: string;
  city: string;
  postalCode: string;
  method: DeliveryMethod;
  items: { product_id: string; quantity: number }[];
};

/**
 * Delivery eligibility and pricing are decided by the database routine.
 * The browser only asks for a quote so the customer can see the fee before
 * submitting; `place_order` recalculates it independently at order time.
 */
export async function fetchDeliveryQuote(input: QuoteInput): Promise<DeliveryQuote> {
  const { data, error } = await supabase.rpc("quote_delivery", {
    _province: input.province,
    _city: input.city,
    _postal_code: input.postalCode,
    _method: input.method,
    _items: input.items,
  });
  if (error) throw error;
  return data as unknown as DeliveryQuote;
}

export function deliveryQuoteQuery(input: QuoteInput, enabled: boolean) {
  return {
    queryKey: ["delivery-quote", input],
    queryFn: () => fetchDeliveryQuote(input),
    enabled,
    staleTime: 30_000,
  };
}

export const provincesQuery = queryOptions({
  queryKey: ["shipping-provinces"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("shipping_provinces")
      .select("id, code, name, is_active, sort_order")
      .order("sort_order");
    if (error) throw error;
    return data;
  },
});

export const shippingZonesQuery = queryOptions({
  queryKey: ["shipping-zones"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("shipping_zones")
      .select("*")
      .order("sort_order");
    if (error) throw error;
    return data;
  },
});

export const postalRulesQuery = queryOptions({
  queryKey: ["shipping-postal-rules"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("shipping_postal_rules")
      .select("*")
      .order("code_from");
    if (error) throw error;
    return data;
  },
});

export const deliveryClassRulesQuery = queryOptions({
  queryKey: ["delivery-class-rules"],
  queryFn: async () => {
    const { data, error } = await supabase.from("delivery_class_rules").select("*").order("label");
    if (error) throw error;
    return data;
  },
});

export const shippingSettingsQuery = queryOptions({
  queryKey: ["shipping-settings"],
  queryFn: async () => {
    const { data, error } = await supabase.from("shipping_settings").select("*").limit(1).maybeSingle();
    if (error) throw error;
    return data;
  },
});
