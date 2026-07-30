/**
 * TechNest supplier catalogue DRY RUN importer.
 * One-time internal utility. Performs ZERO database writes and ZERO storage uploads.
 *
 * Usage: DRY_RUN=true bun run scripts/import/dry-run.ts
 */
import ExcelJS from "exceljs";
import fs from "node:fs";
import path from "node:path";

const DRY_RUN = process.env.DRY_RUN !== "false";

/** Any write path must refuse to run while dry-run mode is active. */
function assertWriteAllowed(op: string): never | void {
  if (DRY_RUN) {
    throw new Error(`Refused: "${op}" is blocked while DRY_RUN=true`);
  }
}
// Guarded stubs — intentionally unreachable in dry-run mode.
export const dbWrite = (op: string) => assertWriteAllowed(`db:${op}`);
export const storageUpload = (op: string) => assertWriteAllowed(`storage:${op}`);

// ---- dry-run pricing assumptions (not read from / written to the database) ----
const MARKUP_RATE = 0.2;
const VAT_RATE = 0.15;

const OUT_DIR = path.resolve("import-reports");
const WORK_DIR = path.resolve(".import-work");

type Workbook = { file: string; label: string; cols: Record<string, number> };

const WORKBOOKS: Workbook[] = [
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

// Existing TechNest categories (read-only reference; no categories are created).
const TECHNEST_CATEGORIES = ["Laptops", "Smartphones", "Audio", "Gaming", "Monitors", "Accessories"];

// Brands with clear evidence in the workbook content.
const KNOWN_BRANDS = ["Hisense", "Toshiba", "Acer", "Mora", "Samsung", "LG", "Sony", "Defy", "Bosch", "Whirlpool"];

const clean = (v: unknown): string =>
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
  const parts = text
    .split("|")
    .map((p) => p.trim())
    .filter(Boolean);
  const structured: Record<string, string> = {};
  const unstructured: string[] = [];
  for (const p of parts) {
    const m = p.match(/^([A-Za-z][A-Za-z0-9 ()/%.'"-]{1,40}?)\s*[:\-–]\s*(.+)$/);
    if (m && m[2].trim()) structured[m[1].trim()] = m[2].trim();
    else unstructured.push(p);
  }
  return { text, structured, unstructured };
}

function detectBrand(sku: string, desc: string, specs: string, section: string) {
  const hay = `${sku} ${desc} ${specs} ${section}`.toLowerCase();
  for (const b of KNOWN_BRANDS) {
    const re = new RegExp(`(^|[^a-z])${b.toLowerCase()}([^a-z]|$)`);
    if (re.test(hay)) return { brand: b, status: "confirmed" as const };
  }
  return { brand: null, status: "manual_review" as const };
}

function mapCategory(section: string) {
  const s = section.toLowerCase();
  const rule = (name: string, confidence: "high" | "medium") => ({ category: name, confidence, status: "mapped" as const });
  if (/(soundbar|speaker|audio|party|hi-?fi|headphone|earbud|bluetooth)/.test(s)) return rule("Audio", "high");
  if (/(gaming)/.test(s)) return rule("Gaming", "medium");
  if (/(monitor)/.test(s)) return rule("Monitors", "high");
  if (/(laptop|notebook)/.test(s)) return rule("Laptops", "high");
  if (/(phone|smartphone)/.test(s)) return rule("Smartphones", "high");
  if (/(bracket|remote|cable|accessor|media box|dongle)/.test(s)) return rule("Accessories", "medium");
  return { category: null, confidence: "none" as const, status: "manual_review" as const };
}

function mapAvailability(raw: string) {
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
  else if (flags.is_discontinued) stock = "out_of_stock";
  else stock = "manual_review";
  return { stock, ...flags };
}

type Row = Record<string, any>;

const HEADER_TOKENS = ["code", "description", "specifications", "availability", "dealer price", "promo price", "image"];

async function run() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(WORK_DIR, { recursive: true });

  const all: Row[] = [];
  const excluded: Row[] = [];
  const perBook: Record<string, any> = {};
  const sectionMap = new Map<string, { section: string; workbook: string; category: string | null; confidence: string; status: string; count: number }>();
  const imageNotes: Row[] = [];

  for (const wbDef of WORKBOOKS) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(path.resolve(wbDef.file));
    const stats = {
      workbook: wbDef.file,
      label: wbDef.label,
      rows_examined: 0,
      valid_products: 0,
      section_heading_rows: 0,
      repeated_header_rows: 0,
      blank_decorative_rows: 0,
      footer_disclaimer_rows: 0,
      with_promo_price: 0,
      missing_promo_price: 0,
      with_images: 0,
      without_images: 0,
      brands_confirmed: 0,
      brands_review: 0,
      categories_mapped: 0,
      categories_review: 0,
      price_parse_failures: 0,
      images_anchored_total: 0,
      images_unassociated: 0,
    };

    for (const ws of wb.worksheets) {
      // Image anchors keyed by row (1-based)
      const anchoredByRow = new Map<number, any[]>();
      const media = (ws as any).getImages?.() ?? [];
      stats.images_anchored_total += media.length;
      for (const img of media) {
        const row = Math.floor(img.range?.tl?.nativeRow ?? 0) + 1;
        const meta = wb.getImage(Number(img.imageId)) as any;
        const list = anchoredByRow.get(row) ?? [];
        list.push({ row, extension: meta?.extension ?? "unknown", name: meta?.name ?? null });
        anchoredByRow.set(row, list);
      }

      let currentSection: string | null = null;
      const usedRows = new Set<number>();

      ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        stats.rows_examined++;
        const c = wbDef.cols;
        const code = cellText(row.getCell(c.code));
        const desc = cellText(row.getCell(c.description));
        const firstCell = cellText(row.getCell(1));
        const joined = row.values ? clean(Object.values(row.values as any).map((v: any) => (typeof v === "object" ? cellText({ value: v } as any) : v)).join(" ")) : "";

        const lower = joined.toLowerCase();
        const isHeaderRow = HEADER_TOKENS.filter((t) => lower.includes(t)).length >= 3;
        if (isHeaderRow) {
          stats.repeated_header_rows++;
          excluded.push({ workbook: wbDef.file, worksheet: ws.name, row: rowNumber, text: joined.slice(0, 120), reason: "repeated_header_row" });
          return;
        }
        if (!joined || /^[.\-–—\s]+$/.test(joined)) {
          stats.blank_decorative_rows++;
          excluded.push({ workbook: wbDef.file, worksheet: ws.name, row: rowNumber, text: joined.slice(0, 120), reason: "blank_or_decorative" });
          return;
        }
        // Merged banner rows (section headings / footers) span the CODE column.
        const codeCell: any = row.getCell(c.code);
        const isBanner = !!codeCell?.isMerged && codeCell?.master?.address !== codeCell?.address;
        // Section heading: only column 1 (or nothing in code/desc columns) has content
        if (isBanner || (!code && !desc)) {

          const isFooter = /(e&oe|terms|conditions|valid|subject to|prices|disclaimer|errors|excl|vat|contact|tel:|email)/i.test(joined) && joined.length > 25;
          if (isFooter) {
            stats.footer_disclaimer_rows++;
            excluded.push({ workbook: wbDef.file, worksheet: ws.name, row: rowNumber, text: joined.slice(0, 160), reason: "footer_or_disclaimer" });
          } else if (firstCell || joined) {
            currentSection = clean(firstCell || joined).toUpperCase();
            stats.section_heading_rows++;
            excluded.push({ workbook: wbDef.file, worksheet: ws.name, row: rowNumber, text: currentSection, reason: "section_heading" });
          }
          return;
        }
        if (!code) {
          excluded.push({ workbook: wbDef.file, worksheet: ws.name, row: rowNumber, text: joined.slice(0, 160), reason: "missing_sku" });
          return;
        }

        usedRows.add(rowNumber);
        const sku = String(rawText(row.getCell(c.code))).trim();
        const normalised_sku = sku.toUpperCase();
        const descRaw = rawText(row.getCell(c.description));
        const name = clean(descRaw);
        const specRaw = rawText(row.getCell(c.specifications));
        const specs = parseSpecs(specRaw);
        const availabilityRaw = clean(rawText(row.getCell(c.availability)));
        const avail = mapAvailability(availabilityRaw);
        const promo = parsePrice(rawText(row.getCell(c.promo)));
        const dealer = parsePrice(rawText(row.getCell(c.dealer)));
        const brand = detectBrand(sku, name, specs.text, currentSection ?? "");
        const cat = mapCategory(currentSection ?? "");
        const anchors = anchoredByRow.get(rowNumber) ?? [];

        const warnings: string[] = [];
        if (!promo.value) warnings.push(`no valid promotional price (${promo.reason}); no customer selling price can be calculated`);
        if (promo.reason && promo.reason.startsWith("non_numeric")) {
          stats.price_parse_failures++;
          warnings.push(`price parse failure: ${promo.reason}`);
        }
        if (brand.status === "manual_review") warnings.push("brand could not be confirmed from code/description/specifications");
        if (cat.status === "manual_review") warnings.push(`supplier section "${currentSection ?? "unknown"}" has no confident TechNest category`);
        if (!anchors.length) warnings.push("no anchored product image found");
        if (anchors.length > 1) warnings.push(`${anchors.length} images anchored to this row`);
        if (avail.stock === "manual_review") warnings.push(`availability text "${availabilityRaw}" not recognised`);

        const expected = promo.value ? Math.round(promo.value * (1 + MARKUP_RATE) * (1 + VAT_RATE) * 100) / 100 : null;
        const validation_status = !promo.value
          ? "pricing_review_required"
          : warnings.length
            ? "review_required"
            : "ready";

        const rec: Row = {
          source_workbook: wbDef.file,
          source_worksheet: ws.name,
          source_row_number: rowNumber,
          source_section: currentSection,
          sku,
          normalised_sku,
          name,
          short_description: name.slice(0, 160),
          full_description: clean(descRaw),
          specifications: specs.structured,
          specifications_unstructured: specs.unstructured,
          specifications_text: specs.text,
          proposed_brand: brand.brand,
          brand_mapping_status: brand.status,
          proposed_category: cat.category,
          category_mapping_status: cat.status,
          category_confidence: cat.confidence,
          promotional_price_ex_vat: promo.value,
          dealer_price_ex_vat: dealer.value,
          expected_selling_price_incl_vat: expected,
          supplier_availability: availabilityRaw,
          proposed_stock_status: avail.stock,
          is_new_arrival: avail.is_new_arrival,
          is_clearance: avail.is_clearance,
          is_discontinued: avail.is_discontinued,
          has_anchored_image: anchors.length > 0,
          image_anchor_row: anchors.length ? anchors[0].row : null,
          image_count: anchors.length,
          image_type: anchors.length ? anchors[0].extension : null,
          proposed_image_filename: anchors.length
            ? `${normalised_sku.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-primary.${anchors[0].extension}`
            : null,
          proposed_publish_status: false,
          validation_status,
          validation_warnings: warnings,
          exclusion_reason: null,
        };

        all.push(rec);
        stats.valid_products++;
        promo.value ? stats.with_promo_price++ : stats.missing_promo_price++;
        anchors.length ? stats.with_images++ : stats.without_images++;
        brand.status === "confirmed" ? stats.brands_confirmed++ : stats.brands_review++;
        cat.status === "mapped" ? stats.categories_mapped++ : stats.categories_review++;

        const key = `${wbDef.file}::${currentSection}`;
        const entry = sectionMap.get(key) ?? {
          section: currentSection ?? "(none)",
          workbook: wbDef.file,
          category: cat.category,
          confidence: cat.confidence,
          status: cat.status,
          count: 0,
        };
        entry.count++;
        sectionMap.set(key, entry);
      });

      // Images anchored to non-product rows (headings / disclaimers)
      for (const [row, list] of anchoredByRow) {
        if (!usedRows.has(row)) {
          stats.images_unassociated += list.length;
          imageNotes.push({
            workbook: wbDef.file,
            worksheet: ws.name,
            anchor_row: row,
            count: list.length,
            note: "image anchored to a non-product row (heading/decorative/disclaimer)",
          });
        }
      }
    }
    perBook[wbDef.label] = stats;
  }

  // duplicates
  const bySku = new Map<string, Row[]>();
  for (const r of all) bySku.set(r.normalised_sku, [...(bySku.get(r.normalised_sku) ?? []), r]);
  const duplicates = [...bySku.entries()].filter(([, v]) => v.length > 1);
  for (const [, rows] of duplicates)
    for (const r of rows) {
      r.validation_warnings.push(`duplicate SKU appears ${rows.length} times — not auto-resolved`);
      if (r.validation_status === "ready") r.validation_status = "review_required";
    }

  const combined = {
    total_valid_products: all.length,
    unique_skus: bySku.size,
    duplicate_skus: duplicates.length,
    ready_for_staging: all.filter((r) => r.validation_status === "ready").length,
    pricing_review_required: all.filter((r) => r.validation_status === "pricing_review_required").length,
    brand_review_required: all.filter((r) => r.brand_mapping_status === "manual_review").length,
    category_review_required: all.filter((r) => r.category_mapping_status === "manual_review").length,
    without_images: all.filter((r) => !r.has_anchored_image).length,
    new_arrivals: all.filter((r) => r.is_new_arrival).length,
    clearance: all.filter((r) => r.is_clearance).length,
    discontinued: all.filter((r) => r.is_discontinued).length,
    excluded_rows: excluded.length,
    exclusion_reasons: excluded.reduce((acc: Record<string, number>, e) => ((acc[e.reason] = (acc[e.reason] ?? 0) + 1), acc), {}),
    expected_catalogue_after_import: 18 + bySku.size,
    database_writes: 0,
    storage_uploads: 0,
    existing_demo_products_changed: 0,
    dry_run: DRY_RUN,
    pricing_assumptions: { markup_rate: MARKUP_RATE, vat_rate: VAT_RATE, source: "dry-run assumption (settings not read from database)" },
  };

  const csv = (rows: Row[], cols: string[]) =>
    [cols.join(","), ...rows.map((r) => cols.map((c) => `"${String(Array.isArray(r[c]) ? r[c].join(" ; ") : typeof r[c] === "object" && r[c] ? JSON.stringify(r[c]) : (r[c] ?? "")).replace(/"/g, '""')}"`).join(","))].join("\n");

  const w = (f: string, s: string) => fs.writeFileSync(path.join(OUT_DIR, f), s);

  w("technest-import-dry-run.json", JSON.stringify({ generated_at: new Date().toISOString(), perBook, combined, products: all, excluded, image_notes: imageNotes }, null, 2));
  w(
    "technest-import-dry-run.csv",
    csv(all, [
      "source_workbook","source_worksheet","source_row_number","source_section","sku","normalised_sku","name","short_description","specifications_text","proposed_brand","brand_mapping_status","proposed_category","category_mapping_status","promotional_price_ex_vat","dealer_price_ex_vat","expected_selling_price_incl_vat","supplier_availability","proposed_stock_status","is_new_arrival","is_clearance","is_discontinued","has_anchored_image","image_anchor_row","proposed_image_filename","proposed_publish_status","validation_status","validation_warnings",
    ]),
  );
  w("technest-category-mapping.csv", csv([...sectionMap.values()].map((s) => ({ ...s, manual_approval_required: s.status !== "mapped" || s.confidence !== "high" })), ["workbook","section","category","confidence","status","count","manual_approval_required"]));
  w("technest-brand-review.csv", csv(all.filter((r) => r.brand_mapping_status === "manual_review"), ["source_workbook","source_row_number","sku","name","source_section","specifications_text","proposed_brand","brand_mapping_status"]));
  w("technest-price-review.csv", csv(all.filter((r) => !r.promotional_price_ex_vat), ["source_workbook","source_row_number","sku","name","supplier_availability","promotional_price_ex_vat","dealer_price_ex_vat","expected_selling_price_incl_vat","validation_status","validation_warnings"]));
  w("technest-image-review.csv", csv([...all.filter((r) => !r.has_anchored_image || r.image_count > 1).map((r) => ({ ...r, note: r.has_anchored_image ? "multiple images anchored" : "no anchored image" })), ...imageNotes], ["source_workbook","source_row_number","sku","name","has_anchored_image","image_count","image_anchor_row","image_type","proposed_image_filename","note","workbook","worksheet","anchor_row","count"]));
  w("technest-excluded-rows.csv", csv(excluded, ["workbook","worksheet","row","text","reason"]));

  const md = [
    "# TechNest supplier import — DRY RUN summary",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Mode: DRY_RUN=${DRY_RUN} — database writes: 0, storage uploads: 0`,
    `Pricing validation assumptions: markup ${MARKUP_RATE * 100}%, VAT ${VAT_RATE * 100}% (dry-run assumption only)`,
    "",
    ...Object.values(perBook).flatMap((s: any) => [`## Workbook ${s.label} — ${s.workbook}`, "```", JSON.stringify(s, null, 2), "```", ""]),
    "## Combined", "```", JSON.stringify(combined, null, 2), "```", "",
    "## Proposed category mapping",
    "| Workbook | Supplier section | Proposed TechNest category | Confidence | Products | Manual approval |",
    "|---|---|---|---|---|---|",
    ...[...sectionMap.values()].map((s) => `| ${s.workbook} | ${s.section} | ${s.category ?? "—"} | ${s.confidence} | ${s.count} | ${s.status !== "mapped" || s.confidence !== "high" ? "yes" : "no"} |`),
    "",
    `Existing TechNest categories (unchanged): ${TECHNEST_CATEGORIES.join(", ")}`,
  ].join("\n");
  w("technest-import-summary.md", md);

  console.log(JSON.stringify({ perBook, combined, duplicates: duplicates.map(([k, v]) => ({ sku: k, rows: v.map((r) => `${r.source_workbook}:${r.source_row_number}`) })) }, null, 2));
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
