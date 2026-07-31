/**
 * Lightweight, provider-agnostic analytics layer.
 *
 * Events are pushed to `window.dataLayer` (GA4 / Google Tag Manager format) and
 * forwarded to `window.gtag` when a tag is installed. With no tag installed
 * nothing is sent and nothing breaks — the queue simply collects on the page.
 * No personal information is ever included in an event payload.
 */
type Params = Record<string, unknown>;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export type AnalyticsEvent =
  | "view_item"
  | "view_item_list"
  | "search"
  | "add_to_cart"
  | "remove_from_cart"
  | "view_cart"
  | "begin_checkout"
  | "add_shipping_info"
  | "purchase"
  | "sign_up"
  | "login"
  | "delivery_enquiry"
  | "delivery_unavailable";

export function track(event: AnalyticsEvent, params: Params = {}) {
  if (typeof window === "undefined") return;
  const payload = { event, currency: "ZAR", ...params };
  window.dataLayer = window.dataLayer ?? [];
  window.dataLayer.push(payload);
  window.gtag?.("event", event, { currency: "ZAR", ...params });
}

export function itemPayload(l: {
  productId?: string;
  id?: string;
  sku?: string;
  name: string;
  price?: number;
  quantity?: number;
}) {
  return {
    item_id: l.sku ?? l.productId ?? l.id,
    item_name: l.name,
    price: l.price,
    quantity: l.quantity ?? 1,
  };
}
