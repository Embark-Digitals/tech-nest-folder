export const ZAR = new Intl.NumberFormat("en-ZA", {
  style: "currency",
  currency: "ZAR",
  minimumFractionDigits: 2,
});

export function formatZAR(value: number | null | undefined) {
  if (value === null || value === undefined) return "Price on request";
  return ZAR.format(value);
}

export function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-ZA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export const STOCK_LABELS: Record<string, string> = {
  available: "In stock",
  low_stock: "Low stock",
  awaiting_confirmation: "Stock confirmed on order",
  preorder: "Coming soon",
  out_of_stock: "Out of stock",
  discontinued: "Discontinued",
};

export const ORDER_STATUS_LABELS: Record<string, string> = {
  new: "New",
  awaiting_stock_confirmation: "Awaiting stock confirmation",
  stock_confirmed: "Stock confirmed",
  awaiting_payment: "Awaiting payment",
  paid: "Paid",
  processing: "Processing",
  ready_for_dispatch: "Ready for dispatch",
  ready_for_collection: "Ready for collection",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  unpaid: "Unpaid",
  paid: "Paid",
  refunded: "Refunded",
  partially_refunded: "Partly refunded",
};

/** Codes used by `shipping_provinces` and stored in delivery addresses. */
export const PROVINCE_NAMES: Record<string, string> = {
  GP: "Gauteng",
  NW: "North West",
  LP: "Limpopo",
  MP: "Mpumalanga",
  FS: "Free State",
  KZN: "KwaZulu-Natal",
  EC: "Eastern Cape",
  WC: "Western Cape",
  NC: "Northern Cape",
};

/** "GP" → "Gauteng"; anything unknown is shown as stored. */
export function provinceName(code: string | null | undefined): string {
  const c = (code ?? "").trim();
  return PROVINCE_NAMES[c.toUpperCase()] ?? c;
}

export const VAT_RATE = 0.15;
