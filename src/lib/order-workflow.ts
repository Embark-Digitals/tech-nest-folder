/**
 * Order workflow rules for the staff console.
 *
 * NEXT_STATUSES mirrors the database function `set_order_status` (the server
 * is always the authority; this only decides which choices the console
 * offers). "Paid" is set only by Record payment, and "Refunded" only by
 * Record refund — never from the status menu. Nothing moves to processing,
 * dispatch or delivery until a payment has been recorded.
 */
import { provinceName } from "@/lib/format";

export const NEXT_STATUSES: Record<string, string[]> = {
  new: ["awaiting_stock_confirmation", "stock_confirmed", "awaiting_payment", "cancelled"],
  awaiting_stock_confirmation: ["stock_confirmed", "cancelled"],
  stock_confirmed: ["awaiting_payment", "processing", "cancelled"],
  awaiting_payment: ["processing", "cancelled"],
  paid: ["processing", "cancelled"],
  processing: ["ready_for_dispatch", "ready_for_collection", "cancelled"],
  ready_for_dispatch: ["shipped", "cancelled"],
  ready_for_collection: ["delivered", "cancelled"],
  shipped: ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
  refunded: [],
};

/** Statuses that need a recorded payment first. */
export const REQUIRES_PAYMENT = new Set([
  "processing",
  "ready_for_dispatch",
  "ready_for_collection",
  "shipped",
  "delivered",
]);

/** Which customer email each status change sends. */
export const STATUS_EMAIL: Record<string, string> = {
  stock_confirmed: "order_status_stock_confirmed",
  awaiting_payment: "order_eft_instructions",
  paid: "order_payment_received",
  processing: "order_status_processing",
  ready_for_dispatch: "order_status_ready_for_dispatch",
  shipped: "order_dispatched",
  delivered: "order_delivered",
  cancelled: "order_cancelled",
  refunded: "order_refunded",
};

export function nextStatuses(status: string, paymentStatus: string | null | undefined): string[] {
  const paid = paymentStatus === "paid";
  return (NEXT_STATUSES[status] ?? []).filter((s) => paid || !REQUIRES_PAYMENT.has(s));
}

export const canRecordPayment = (o: { status: string; payment_status: string | null }) =>
  o.payment_status !== "paid" &&
  o.payment_status !== "refunded" &&
  o.payment_status !== "partially_refunded" &&
  o.status !== "cancelled" &&
  o.status !== "refunded";

export const canRecordRefund = (o: { status: string; payment_status: string | null }) =>
  o.payment_status === "paid" && (o.status === "cancelled" || o.status === "delivered");

/** Delivery address as stored by checkout (`orders.delivery_address`). */
export type DeliveryAddress = {
  line1?: string | null;
  suburb?: string | null;
  city?: string | null;
  province?: string | null;
  postal_code?: string | null;
};

export function formatAddress(a: unknown): string[] {
  if (!a || typeof a !== "object") return [];
  const d = a as DeliveryAddress;
  return [
    d.line1,
    d.suburb,
    [d.city, d.postal_code].filter(Boolean).join(" "),
    provinceName(d.province),
  ]
    .map((s) => (s ?? "").toString().trim())
    .filter(Boolean);
}

/** South African number → wa.me link (0821234567 → 27821234567). */
export function whatsappLink(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length < 9) return null;
  const intl = digits.startsWith("27")
    ? digits
    : digits.startsWith("0")
      ? `27${digits.slice(1)}`
      : digits;
  return `https://wa.me/${intl}`;
}
