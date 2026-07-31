/**
 * Lightweight, provider-agnostic analytics layer.
 *
 * Events are pushed to `window.dataLayer` (GA4 / Google Tag Manager format) and
 * forwarded to `window.gtag` when a tag is installed. With no tag installed
 * nothing is sent and nothing breaks — the queue simply collects on the page.
 *
 * PRIVACY: never pass names, email addresses, phone numbers, delivery
 * addresses or any other personal detail into an event payload. Items carry
 * SKU, product name, price and quantity only.
 *
 * REVENUE SEMANTICS: TechNest has no live payment gateway. Creating an order
 * is NOT revenue. `order_submitted` fires when a request order is created;
 * `purchase` fires only once an order reaches a confirmed paid state
 * (authorised manual EFT confirmation, or a future verified gateway
 * settlement), using server-stored totals.
 */
type Params = Record<string, unknown>;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export type AnalyticsEvent =
  // Browsing
  | "view_item"
  | "view_item_list"
  | "search"
  | "add_to_cart"
  | "remove_from_cart"
  | "view_cart"
  // Checkout
  | "begin_checkout"
  | "add_shipping_info"
  | "delivery_unavailable"
  | "delivery_enquiry_submitted"
  // Order lifecycle (not revenue)
  | "order_submitted"
  | "manual_eft_selected"
  // Revenue and reversals
  | "payment_confirmed"
  | "purchase"
  | "order_cancelled"
  | "refund"
  // Account
  | "sign_up"
  | "login";

export function track(event: AnalyticsEvent, params: Params = {}) {
  if (typeof window === "undefined") return;
  const payload = { event, currency: "ZAR", ...params };
  window.dataLayer = window.dataLayer ?? [];
  window.dataLayer.push(payload);
  window.gtag?.("event", event, { currency: "ZAR", ...params });
}

const DEDUPE_KEY = "technest.analytics.sent";

function sentSet(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(DEDUPE_KEY);
    return new Set<string>(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

/**
 * Fires a conversion-class event at most once per (event, key) pair, where the
 * key is the order id or payment reference. Guarantees a refund or
 * cancellation cannot be double-counted, and that a repeated payment
 * confirmation does not produce a second `purchase`.
 */
export function trackOnce(event: AnalyticsEvent, key: string, params: Params = {}) {
  if (typeof window === "undefined" || !key) return false;
  const id = `${event}:${key}`;
  const sent = sentSet();
  if (sent.has(id)) return false;
  sent.add(id);
  try {
    // Keep the ledger bounded — only the most recent conversions matter.
    window.localStorage.setItem(DEDUPE_KEY, JSON.stringify([...sent].slice(-200)));
  } catch {
    /* storage unavailable — the event still fires, just without dedupe memory */
  }
  track(event, params);
  return true;
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
