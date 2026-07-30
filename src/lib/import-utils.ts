export type ParsedRow = {
  rowNumber: number;
  sku: string;
  name: string;
  description: string;
  promotionalPrice: number | null;
  dealerPrice: number | null;
  availability: string;
  stockStatus: string;
  quantity: number | null;
  valid: boolean;
  error?: string;
};

export function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function pick(row: Record<string, unknown>, keys: string[]) {
  const normalised = Object.fromEntries(
    Object.entries(row).map(([k, v]) => [k.toLowerCase().replace(/[^a-z0-9]/g, ""), v]),
  );
  for (const key of keys) {
    const value = normalised[key.toLowerCase().replace(/[^a-z0-9]/g, "")];
    if (value !== undefined && value !== "") return value;
  }
  return undefined;
}

function toNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const num = Number(String(value).replace(/[^0-9.,-]/g, "").replace(/,/g, ""));
  return Number.isFinite(num) ? num : null;
}

const AVAILABILITY_MAP: Record<string, string> = {
  instock: "in_stock",
  in: "in_stock",
  available: "in_stock",
  lowstock: "low_stock",
  low: "low_stock",
  newinstock: "new_in_stock",
  new: "new_in_stock",
  eta: "eta",
  clearance: "clearance",
  endoflife: "end_of_life",
  eol: "end_of_life",
  outofstock: "out_of_stock",
  out: "out_of_stock",
};

const STOCK_MAP: Record<string, string> = {
  in_stock: "available",
  new_in_stock: "available",
  low_stock: "low_stock",
  clearance: "available",
  eta: "preorder",
  end_of_life: "discontinued",
  out_of_stock: "out_of_stock",
  unknown: "awaiting_confirmation",
};

export function parseCatalogueRows(rows: Record<string, unknown>[]): ParsedRow[] {
  return rows.map((row, index) => {
    const sku = String(pick(row, ["product code", "sku", "code", "item code"]) ?? "").trim();
    const name = String(
      pick(row, ["description", "product description", "name", "product name"]) ?? "",
    ).trim();
    const promotionalPrice = toNumber(pick(row, ["promotional price", "promo price", "promotionalprice"]));
    const dealerPrice = toNumber(pick(row, ["dealer price", "cost", "dealerprice"]));
    const quantity = toNumber(pick(row, ["quantity", "qty", "stock"]));
    const rawAvailability = String(pick(row, ["availability", "stock status", "status"]) ?? "")
      .toLowerCase()
      .replace(/[^a-z]/g, "");
    const availability = AVAILABILITY_MAP[rawAvailability] ?? "unknown";

    let error: string | undefined;
    if (!sku) error = "Missing product code";
    else if (!name) error = "Missing description";
    else if (promotionalPrice === null || promotionalPrice <= 0) error = "Missing promotional price";

    return {
      rowNumber: index + 2,
      sku,
      name,
      description: name,
      promotionalPrice,
      dealerPrice,
      availability,
      stockStatus: STOCK_MAP[availability] ?? "awaiting_confirmation",
      quantity: quantity !== null ? Math.max(0, Math.round(quantity)) : null,
      valid: !error,
      error,
    };
  });
}
