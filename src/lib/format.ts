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
  awaiting_confirmation: "Awaiting stock confirmation",
  preorder: "Pre-order",
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
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

export const VAT_RATE = 0.15;
