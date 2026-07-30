/**
 * Shared supplier-workbook parser for TechNest.
 * Row-detection logic is the APPROVED corrected detector from scripts/import/dry-run.ts
 * (expected columns probed at offset 0 and a one-column-right shift; merged banner rows rejected).
 * Do not weaken this detector.
 */
import ExcelJS from "exceljs";
import path from "node:path";

export type WorkbookDef = { file: string; label: string; cols: Record<string, number> };

export const WORKBOOKS: WorkbookDef[] = [
  {
    file: "Audio Visual Price List Catalogue July 2026.xlsx",
    label: "A",
    cols: { image: 1, code: 4, description: 6, specifications: 8, availability: 10, dealer: 12, promo: 14 },
  },
  {
    file: "HA Price List July 2026 Collection.xlsx",
    label: "B",
    cols: { image: 1, code: 3, description: 5, specifications: 7, availability: 9, dealer: 11, promo: 13 },
  },
];

export const clean = (v: unknown): string =>
  String(v ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const cellText = (c: ExcelJS.Cell | undefined): string => {
  const v: any = c?.value;
  if (v == null) return "";
  if (typeof v === "object") {
    if (Array.isArray(v.richText)) return clean(v.richText.map((r: any) => r.text).join(""));
    if (v.text) return clean(v.text);
    if (v.result != null) return clean(v.result);
    return clean(v.toString?.());
  }
  return clean(v);
};

const rawText = (c: ExcelJS.Cell | undefined): string => {
  const v: any = c?.value;
  if (v == null) return "";
  if (typeof v === "object" && Array.isArray(v.richText)) return v.richText.map((r: any) => r.text).join("");
  if (typeof v === "object" && v.text) return v.text;
  return String(v);
};

function parsePrice(raw: string): { value: number | null; reason: string | null } {
  const s = clean(raw);
  if (!s || s === "-" || s === "—" || /^n\/?a$/i.test(s) || /^tba$/i.test(s)) return { value: null, reason: "missing" };
  const cleaned = s.replace(/[Rr]\s?/g, "").replace(/[,\s]/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return { value: null, reason: `non_numeric:${s}` };
  const n = Number(cleaned);
  if (n < 0) return { value: null, reason: "negative" };
  if (n === 0) return { value: null, reason: "zero" };
  return { value: n, reason: null };
}

function parseSpecs(raw: string) {
  const text = clean(raw.replace(/\n/g, " | "));
  const parts = text.split("|").map((p) => p.trim()).filter(Boolean);
  const structured: Record<string, string> = {};
  const unstructured: string[] = [];
  for (const p of parts) {
    const m = p.match(/^([A-Za-z][A-Za-z0-9 ()/%.'"-]{1,40}?)\s*:\s*(.+)$/);
    if (m && m[2].trim()) structured[m[1].trim()] = m[2].trim();
    else unstructured.push(p);
  }
  return { text, structured, unstructured };
}

const BRAND_PREFIXES = ["Hisense", "Toshiba", "Mora", "Kelon"];
const BRAND_REVIEW_SKUS = new Set(["PARTY THUNDER", "AP-12HW4RNXS00"]);

function detectBrand(sku: string, desc: string, specs: string, _section: string, workbookLabel: string) {
  const normalised = sku.trim().toUpperCase();
  if (BRAND_REVIEW_SKUS.has(normalised)) return { brand: null, status: "manual_review" as const };
  if (normalised === "GP.OTH11.08V" || /\bacer\b/i.test(`${sku} ${desc}`)) return { brand: "Acer", status: "confirmed" as const };
  for (const b of BRAND_PREFIXES) if (normalised.startsWith(b.toUpperCase())) return { brand: b, status: "confirmed" as const };
  const hay = `${desc} ${specs}`.toLowerCase();
  for (const b of [...BRAND_PREFIXES, "Samsung", "LG", "Sony", "Defy"]) {
    if (new RegExp(`(^|[^a-z])${b.toLowerCase()}([^a-z]|$)`).test(hay)) return { brand: b, status: "confirmed" as const };
  }
  if (workbookLabel === "B" && /^[A-Z]{1,4}[0-9]/.test(normalised)) return { brand: "Hisense", status: "confirmed_by_catalogue_rule" as const };
  return { brand: null, status: "manual_review" as const };
}

/** Approved category structure (customer-facing names as approved by the owner). */
const SECTION_CATEGORY_MAP: Record<string, [string, string]> = {
  "LED SMART": ["Televisions", "LED Smart TVs"],
  "4K UHD SMART TV": ["Televisions", "4K UHD Smart TVs"],
  "QLED SMART TV": ["Televisions", "QLED Smart TVs"],
  "4K UHD ULED SMART TV": ["Televisions", "ULED TVs"],
  "4K MINI LED ULED SMART TV": ["Televisions", "Mini-LED ULED TVs"],
  "LASER TV": ["Televisions", "Laser TVs"],
  "TOSHIBA TV": ["Televisions", "Toshiba TVs"],
  "SOUND BAR": ["Audio", "Soundbars"],
  "DIGITAL MEDIA BOX": ["Streaming Devices", "Digital Media Boxes"],
  "MULTI DOOR REFRIGERATOR": ["Refrigeration", "Multi-Door Refrigerators"],
  "COMBI REFRIGERATOR": ["Refrigeration", "Combi Refrigerators"],
  "BAR FRIDGE": ["Refrigeration", "Bar Fridges"],
  "CHEST FREEZER": ["Refrigeration", "Chest Freezers"],
  MICROWAVE: ["Cooking Appliances", "Microwaves"],
  "BUILT IN OVEN": ["Cooking Appliances", "Built-In Ovens"],
  HOBS: ["Cooking Appliances", "Hobs"],
  EXTRACTOR: ["Cooking Appliances", "Extractors"],
  "FREE STANDING COOKER / STOVE": ["Cooking Appliances", "Freestanding Cookers"],
  "AIR FRYER": ["Small Appliances", "Air Fryers"],
  DISHWASHER: ["Dishwashing", "Dishwashers"],
  "FRONT LOADER WASHING MACHINE": ["Laundry", "Front-Loader Washing Machines"],
  "TOP LOADER WASHING MACHINE": ["Laundry", "Top-Loader Washing Machines"],
  "TWIN TUB WASHING MACHINE": ["Laundry", "Twin-Tub Washing Machines"],
  "TUMBLE DRYER": ["Laundry", "Tumble Dryers"],
  "AIR CONDITIONER": ["Climate Control", "Split Air Conditioners"],
};

function mapCategory(section: string, sku: string, name: string) {
  const key = clean(section).toUpperCase();
  const n = `${sku} ${name}`.toLowerCase();
  if (/party thunder|party speaker/.test(n)) return { parent: "Audio", category: "Party Speakers", status: "mapped" as const };
  if (key === "AIR CONDITIONER" && /portable/.test(n)) return { parent: "Climate Control", category: "Portable Air Conditioners", status: "mapped" as const };
  const hit = SECTION_CATEGORY_MAP[key];
  if (hit) return { parent: hit[0], category: hit[1], status: "mapped" as const };
  return { parent: null, category: null, status: "manual_review" as const };
}

/** Approved availability policy. Original supplier text is preserved separately. */
export function mapAvailability(raw: string) {
  const s = clean(raw).toLowerCase();
  const flags = {
    is_new_arrival: /\bnew\b/.test(s),
    is_clearance: /(clearance|to clear|last buy)/.test(s),
    is_discontinued: /\beol\b|end of life|discontinued/.test(s),
  };
  let stock: string;
  if (/(sold out|out of stock)/.test(s)) stock = "out_of_stock";
  else if (/(eta|special order|pre-?order)/.test(s)) stock = "preorder";
  else if (/(low stock|limited|very limited)/.test(s)) stock = "low_stock";
  else if (/in stock|soh/.test(s)) stock = "available";
  else if (flags.is_discontinued) stock = "discontinued";
  else stock = "awaiting_confirmation";

  let supplier: string;
  if (flags.is_discontinued) supplier = "end_of_life";
  else if (flags.is_clearance) supplier = "clearance";
  else if (stock === "out_of_stock") supplier = "out_of_stock";
  else if (stock === "preorder") supplier = "eta";
  else if (stock === "low_stock") supplier = "low_stock";
  else if (stock === "available") supplier = flags.is_new_arrival ? "new_in_stock" : "in_stock";
  else supplier = "unknown";

  return { stock, supplier, ...flags };
}

const HEADER_TOKENS = ["code", "description", "specifications", "availability", "dealer price", "promo price", "image"];

export type ParsedProduct = {
  workbook_label: string;
  source_workbook: string;
  source_worksheet: string;
  source_row_number: number;
  source_section: string | null;
  column_offset: number;
  sku: string;
  normalised_sku: string;
  name: string;
  short_description: string;
  specifications: Record<string, string>;
  specifications_text: string;
  brand: string | null;
  brand_status: string;
  parent_category: string | null;
  category: string | null;
  category_status: string;
  promotional_price_ex_vat: number | null;
  dealer_price_ex_vat: number | null;
  supplier_availability_raw: string;
  stock_status: string;
  supplier_availability: string;
  is_new_arrival: boolean;
  is_clearance: boolean;
  is_discontinued: boolean;
  image: { extension: string; buffer: Buffer } | null;
  image_anchor_row: number | null;
  image_count: number;
};

export async function parseWorkbooks() {
  const products: ParsedProduct[] = [];
  const perBook: Record<string, { workbook: string; rows_examined: number; valid_products: number; with_images: number; without_images: number }> = {};

  for (const wbDef of WORKBOOKS) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(path.resolve(wbDef.file));
    const stats = { workbook: wbDef.file, rows_examined: 0, valid_products: 0, with_images: 0, without_images: 0 };

    for (const ws of wb.worksheets) {
      const anchoredByRow = new Map<number, { extension: string; buffer: Buffer }[]>();
      const media = (ws as any).getImages?.() ?? [];
      for (const img of media) {
        const row = Math.floor(img.range?.tl?.nativeRow ?? 0) + 1;
        const meta = wb.getImage(Number(img.imageId)) as any;
        const list = anchoredByRow.get(row) ?? [];
        list.push({ extension: (meta?.extension ?? "png").toLowerCase(), buffer: Buffer.from(meta?.buffer ?? []) });
        anchoredByRow.set(row, list);
      }

      let currentSection: string | null = null;

      ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        stats.rows_examined++;
        const base = wbDef.cols;
        const firstCell = cellText(row.getCell(1));
        const joined = row.values
          ? clean(Object.values(row.values as any).map((v: any) => (typeof v === "object" ? cellText({ value: v } as any) : v)).join(" "))
          : "";

        const lower = joined.toLowerCase();
        if (HEADER_TOKENS.filter((t) => lower.includes(t)).length >= 3) return;
        if (!joined || /^[.\-–—\s]+$/.test(joined)) return;

        const shifted = (off: number) => ({
          code: base.code + off,
          description: base.description + off,
          specifications: base.specifications + off,
          availability: base.availability + off,
          dealer: base.dealer + off,
          promo: base.promo + off,
        });
        let c: ReturnType<typeof shifted> | null = null;
        let columnOffset = 0;
        for (const off of [0, 1]) {
          const t = shifted(off);
          const codeT = cellText(row.getCell(t.code));
          const descT = cellText(row.getCell(t.description));
          const specT = cellText(row.getCell(t.specifications));
          const availT = cellText(row.getCell(t.availability));
          const isBanner = codeT === descT || descT === specT || specT === availT;
          if (codeT && descT && specT && availT && !isBanner) {
            c = t;
            columnOffset = off;
            break;
          }
        }

        if (!c) {
          const isFooter = /(e&oe|terms|conditions|subject to|disclaimer|errors|reserve the right|excl|contact|tel:|email)/i.test(joined) && joined.length > 25;
          if (!isFooter) {
            let label = firstCell;
            for (let col = 1; !label && col <= 20; col++) label = cellText(row.getCell(col));
            currentSection = clean(label || joined).toUpperCase();
          }
          return;
        }

        const sku = String(rawText(row.getCell(c.code))).trim();
        const normalised_sku = sku.toUpperCase();
        const name = clean(rawText(row.getCell(c.description)));
        const specs = parseSpecs(rawText(row.getCell(c.specifications)));
        const availabilityRaw = clean(rawText(row.getCell(c.availability)));
        const avail = mapAvailability(availabilityRaw);
        const promo = parsePrice(rawText(row.getCell(c.promo)));
        const dealer = parsePrice(rawText(row.getCell(c.dealer)));
        const brand = detectBrand(sku, name, specs.text, currentSection ?? "", wbDef.label);
        const cat = mapCategory(currentSection ?? "", sku, name);
        const anchors = anchoredByRow.get(rowNumber) ?? [];

        products.push({
          workbook_label: wbDef.label,
          source_workbook: wbDef.file,
          source_worksheet: ws.name,
          source_row_number: rowNumber,
          source_section: currentSection,
          column_offset: columnOffset,
          sku,
          normalised_sku,
          name,
          short_description: name,
          specifications: specs.structured,
          specifications_text: specs.text,
          brand: brand.brand,
          brand_status: brand.status,
          parent_category: cat.parent,
          category: cat.category,
          category_status: cat.status,
          promotional_price_ex_vat: promo.value,
          dealer_price_ex_vat: dealer.value,
          supplier_availability_raw: availabilityRaw,
          stock_status: avail.stock,
          supplier_availability: avail.supplier,
          is_new_arrival: avail.is_new_arrival,
          is_clearance: avail.is_clearance,
          is_discontinued: avail.is_discontinued,
          image: anchors[0] ?? null,
          image_anchor_row: anchors.length ? rowNumber : null,
          image_count: anchors.length,
        });
        stats.valid_products++;
        anchors.length ? stats.with_images++ : stats.without_images++;
      });
    }
    perBook[wbDef.label] = stats;
  }

  return { products, perBook };
}
