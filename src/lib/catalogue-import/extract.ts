/**
 * TechNest supplier-catalogue extraction (runs in the administrator's browser).
 *
 * Deterministic parsing is always attempted first for XLSX / XLS / CSV.
 * PDF text extraction is used for searchable PDFs. Scanned PDFs with no
 * recoverable text layer are reported as unsupported rather than guessed at.
 *
 * This module NEVER calculates a customer selling price.
 */
import * as XLSX from "xlsx";

export const PARSER_VERSION = "technest-supplier-parser/2.1.0";

export type SourceFormat = "xlsx" | "xls" | "csv" | "pdf_text" | "pdf_scanned" | "unsupported";

export type ExtractedRow = {
  source_worksheet: string | null;
  source_page: number | null;
  source_row_number: number;
  source_section: string | null;
  supplier_sku: string | null;
  model_number: string | null;
  part_number: string | null;
  product_name: string | null;
  short_description: string | null;
  specifications_text: string | null;
  brand_raw: string | null;
  category_raw: string | null;
  availability_raw: string | null;
  dealer_price_ex_vat: number | null;
  promotional_price_ex_vat: number | null;
  raw_row: Record<string, unknown>;
  /** Populated when the row cannot be treated as a product. */
  validation_error: string | null;
  ignored_as: null | "header" | "repeated_header" | "section" | "footer" | "decorative" | "duplicate";
};

export type ExtractionResult = {
  format: SourceFormat;
  parser_version: string;
  checksum: string;
  supplier: string | null;
  catalogue_date: string | null;
  rows_examined: number;
  headings_detected: number;
  repeated_headers: number;
  ignored_rows: number;
  duplicate_rows: number;
  rows: ExtractedRow[];
  warnings: string[];
};

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

export const clean = (v: unknown): string =>
  String(v ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export async function sha256Hex(file: File | ArrayBuffer): Promise<string> {
  const buf = file instanceof ArrayBuffer ? file : await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function parsePrice(raw: unknown): number | null {
  const s = clean(raw);
  if (!s || /^(-|—|n\/?a|tba|poa)$/i.test(s)) return null;
  const cleaned = s.replace(/[Rr]\s?/g, "").replace(/[,\s]/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const COLUMN_TOKENS: Record<string, RegExp> = {
  supplier_sku: /^(product\s*)?(code|sku|item\s*(code|no|number)|stock\s*code)$/i,
  model_number: /^(model|model\s*(no|number|code))$/i,
  part_number: /^(part\s*(no|number)|mpn)$/i,
  product_name: /^(description|product\s*(description|name)|name|product)$/i,
  specifications_text: /^(spec(ification)?s?|features|details)$/i,
  brand_raw: /^(brand|make|manufacturer|supplier\s*brand)$/i,
  category_raw: /^(category|categories|product\s*(type|group|category)|department|range)$/i,
  availability_raw: /^(availability|stock|stock\s*status|status|soh)$/i,
  dealer_price_ex_vat: /^(dealer|dealer\s*price|cost|cost\s*price|trade\s*price)( excl.*)?$/i,
  promotional_price_ex_vat: /^(promo(tional)?\s*price|promo|special|selling\s*price|price)( excl.*)?$/i,
};

const HEADER_HINTS = /code|sku|description|price|availability|specification|stock/i;

function headerScore(cells: string[]): number {
  return cells.filter((c) => c && HEADER_HINTS.test(c)).length;
}

/** Map a header row to column indexes. */
function mapColumns(cells: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  cells.forEach((cell, i) => {
    const t = clean(cell);
    if (!t) return;
    for (const [field, re] of Object.entries(COLUMN_TOKENS)) {
      if (map[field] === undefined && re.test(t)) map[field] = i;
    }
  });
  // looser second pass for compound headers e.g. "Promotional Price Excl VAT"
  cells.forEach((cell, i) => {
    const t = clean(cell).toLowerCase();
    if (!t) return;
    if (map.promotional_price_ex_vat === undefined && /promo/.test(t) && /price/.test(t)) map.promotional_price_ex_vat = i;
    if (map.dealer_price_ex_vat === undefined && /dealer|cost|trade/.test(t) && /price/.test(t)) map.dealer_price_ex_vat = i;
    if (map.product_name === undefined && /descrip/.test(t)) map.product_name = i;
    if (map.supplier_sku === undefined && /\bcode\b|\bsku\b/.test(t)) map.supplier_sku = i;
    if (map.availability_raw === undefined && /avail|stock/.test(t)) map.availability_raw = i;
    if (map.specifications_text === undefined && /spec/.test(t)) map.specifications_text = i;
    if (map.brand_raw === undefined && /\bbrand\b|manufactur/.test(t)) map.brand_raw = i;
    if (map.category_raw === undefined && /categor|department/.test(t)) map.category_raw = i;
  });
  return map;
}

const FOOTER_RE =
  /(e&oe|terms|conditions|subject to change|disclaimer|errors and omissions|reserve the right|prices exclude|contact us|tel:|email:|www\.)/i;

/** Merged cells repeat the same text; collapse it to a single label. */
function sectionLabel(cells: string[]): string {
  const filled = cells.filter(Boolean);
  const unique: string[] = [];
  for (const c of filled) if (unique[unique.length - 1] !== c) unique.push(c);
  return clean(unique.join(" ")).toUpperCase().slice(0, 120);
}

function isDecorative(cells: string[]): boolean {
  const joined = cells.join("").trim();
  return !joined || /^[.\-–—_\s*]+$/.test(joined);
}

/** A merged banner row repeats the same text across the mapped columns. */
function isBanner(values: string[]): boolean {
  const filled = values.filter(Boolean);
  return filled.length > 1 && new Set(filled).size === 1;
}

function detectCatalogueDate(text: string): string | null {
  const months =
    "january|february|march|april|may|june|july|august|september|october|november|december";
  const m =
    text.match(new RegExp(`(${months})\\s+(20\\d{2})`, "i")) ??
    text.match(/(20\d{2})[-/](\d{1,2})[-/](\d{1,2})/);
  if (!m) return null;
  if (/^20/.test(m[1])) return `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;
  const idx = months.split("|").indexOf(m[1].toLowerCase()) + 1;
  return `${m[2]}-${String(idx).padStart(2, "0")}-01`;
}

/* ------------------------------------------------------------------ */
/* sheet-based extraction (XLSX / XLS / CSV)                           */
/* ------------------------------------------------------------------ */

function extractSheets(wb: XLSX.WorkBook, result: ExtractionResult) {
  const seen = new Set<string>();

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;
    const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: false, blankrows: false });

    let columns: Record<string, number> | null = null;
    let headerCells: string = "";
    let section: string | null = null;

    grid.forEach((rawCells, i) => {
      const rowNumber = i + 1;
      const cells = (rawCells as unknown[]).map(clean);
      result.rows_examined++;

      const push = (patch: Partial<ExtractedRow>) =>
        result.rows.push({
          source_worksheet: sheetName,
          source_page: null,
          source_row_number: rowNumber,
          source_section: section,
          supplier_sku: null,
          model_number: null,
          part_number: null,
          product_name: null,
          short_description: null,
          specifications_text: null,
          brand_raw: null,
          category_raw: null,
          availability_raw: null,
          dealer_price_ex_vat: null,
          promotional_price_ex_vat: null,
          raw_row: { cells },
          validation_error: null,
          ignored_as: null,
          ...patch,
        });

      if (isDecorative(cells)) {
        result.ignored_rows++;
        return push({ ignored_as: "decorative" });
      }

      const joined = cells.join(" ");

      // header / repeated header — a row holding a parsable price is data, not a header
      const looksLikeHeader =
        headerScore(cells) >= 3 &&
        !(columns && columns["promotional_price_ex_vat"] !== undefined &&
          parsePrice(cells[columns["promotional_price_ex_vat"]]) !== null);
      if (looksLikeHeader && Object.keys(mapColumns(cells)).length >= 3) {
        const signature = cells.join("|");
        if (columns && signature === headerCells) {
          result.repeated_headers++;
          result.ignored_rows++;
          return push({ ignored_as: "repeated_header" });
        }
        columns = mapColumns(cells);
        headerCells = signature;
        result.headings_detected++;
        result.ignored_rows++;
        return push({ ignored_as: "header" });
      }

      if (FOOTER_RE.test(joined) && joined.length > 25) {
        result.ignored_rows++;
        return push({ ignored_as: "footer" });
      }

      if (!columns) {
        section = sectionLabel(cells);
        result.ignored_rows++;
        return push({ ignored_as: "section" });
      }

      // Some supplier rows sit one column to the right of the header. Probe an
      // offset of 0 then 1 (the approved TechNest shift detector) before
      // treating the row as a heading.
      const probe = (off: number) => (f: string) =>
        columns![f] === undefined ? "" : (cells[columns![f] + off] ?? "");
      let at = probe(0);
      if (!(at("supplier_sku") && at("product_name"))) {
        const shifted = probe(1);
        if (shifted("supplier_sku") && shifted("product_name")) at = shifted;
      }
      const values = Object.keys(columns).map((f) => at(f));

      const sku = at("supplier_sku");
      const name = at("product_name");

      const filledCells = cells.filter(Boolean);
      if (isBanner(values) || (!sku && !name) || filledCells.length <= 1 || new Set(filledCells).size === 1) {
        // a merged banner, a spanning label or a lone-cell row is a section heading
        section = sectionLabel(cells) || section;
        result.ignored_rows++;
        return push({ ignored_as: "section" });
      }

      const promo = parsePrice(at("promotional_price_ex_vat"));
      const dealer = parsePrice(at("dealer_price_ex_vat"));

      let validation_error: string | null = null;
      if (!sku) validation_error = "Missing supplier product code";
      else if (!name) validation_error = "Missing product description";
      else if (promo === null && dealer === null) validation_error = "No usable supplier price";

      const key = `${sheetName}::${sku.toUpperCase()}`;
      let ignored_as: ExtractedRow["ignored_as"] = null;
      if (sku && seen.has(key)) {
        ignored_as = "duplicate";
        result.duplicate_rows++;
        validation_error = validation_error ?? "Duplicate supplier code in this file";
      } else if (sku) {
        seen.add(key);
      }

      push({
        supplier_sku: sku || null,
        model_number: at("model_number") || null,
        part_number: at("part_number") || null,
        product_name: name || null,
        short_description: name || null,
        specifications_text: at("specifications_text") || null,
        brand_raw: at("brand_raw") || null,
        category_raw: at("category_raw") || section || null,
        availability_raw: at("availability_raw") || null,
        dealer_price_ex_vat: dealer,
        promotional_price_ex_vat: promo,
        validation_error,
        ignored_as,
      });
    });

    if (!columns) {
      result.warnings.push(`Worksheet "${sheetName}": no product header row was recognised.`);
    }
  }
}

/* ------------------------------------------------------------------ */
/* PDF extraction                                                      */
/* ------------------------------------------------------------------ */

async function extractPdf(buffer: ArrayBuffer, result: ExtractionResult) {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text, totalPages } = await extractText(pdf, { mergePages: false });
  const pages = Array.isArray(text) ? text : [String(text)];

  const allText = pages.join("\n");
  if (clean(allText).length < 40) {
    result.format = "pdf_scanned";
    result.warnings.push(
      "This PDF contains no recoverable text layer (scanned image). Optical character recognition is not available, so the file cannot be imported automatically — supply an XLSX or CSV version.",
    );
    return;
  }

  result.format = "pdf_text";
  result.catalogue_date = detectCatalogueDate(allText);
  result.warnings.push(
    "PDF tables are reconstructed from text positions. Every extracted row is marked for manual review before it can be applied.",
  );

  // Require a decimal amount or an explicit R prefix so years and model
  // numbers in headings are never mistaken for prices.
  const priceRe = /(?:R\s?)(\d[\d ,]*(?:\.\d{1,2})?)|(\d[\d ,]*\.\d{2})\b/g;

  pages.forEach((pageText, p) => {
    const lines = String(pageText).split("\n");
    let section: string | null = null;

    lines.forEach((line, i) => {
      result.rows_examined++;
      const t = clean(line);
      const push = (patch: Partial<ExtractedRow>) =>
        result.rows.push({
          source_worksheet: null,
          source_page: p + 1,
          source_row_number: i + 1,
          source_section: section,
          supplier_sku: null,
          model_number: null,
          part_number: null,
          product_name: null,
          short_description: null,
          specifications_text: null,
          brand_raw: null,
          category_raw: null,
          availability_raw: null,
          dealer_price_ex_vat: null,
          promotional_price_ex_vat: null,
          raw_row: { line: t },
          validation_error: null,
          ignored_as: null,
          ...patch,
        });

      if (!t) {
        result.ignored_rows++;
        return push({ ignored_as: "decorative" });
      }
      if (headerScore(t.split(/\s{2,}/)) >= 3) {
        result.headings_detected++;
        result.ignored_rows++;
        return push({ ignored_as: "header" });
      }
      if (FOOTER_RE.test(t) && t.length > 25) {
        result.ignored_rows++;
        return push({ ignored_as: "footer" });
      }

      const codeMatch = t.match(/^([A-Z0-9][A-Z0-9._/-]{3,})\s+(.*)$/);
      const prices = [...t.matchAll(priceRe)]
        .map((m) => parsePrice(m[1] ?? m[2]))
        .filter((n): n is number => n !== null);

      if (!codeMatch || prices.length === 0) {
        if (t.length < 60 && !/\d/.test(t)) section = t.toUpperCase();
        result.ignored_rows++;
        return push({ ignored_as: "section" });
      }

      const rest = codeMatch[2].replace(priceRe, "").trim();
      push({
        supplier_sku: codeMatch[1],
        product_name: rest || null,
        category_raw: section,
        short_description: rest || null,
        dealer_price_ex_vat: prices.length > 1 ? prices[prices.length - 2] : null,
        promotional_price_ex_vat: prices[prices.length - 1] ?? null,
        validation_error: rest ? null : "Missing product description",
      });
    });
  });

  if (totalPages && result.rows.every((r) => r.ignored_as)) {
    result.warnings.push("No product rows could be reconstructed from this PDF.");
  }
}

/* ------------------------------------------------------------------ */
/* entry point                                                         */
/* ------------------------------------------------------------------ */

export async function extractSupplierFile(file: File): Promise<ExtractionResult> {
  const buffer = await file.arrayBuffer();
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();

  const result: ExtractionResult = {
    format: "unsupported",
    parser_version: PARSER_VERSION,
    checksum: await sha256Hex(buffer),
    supplier: null,
    catalogue_date: detectCatalogueDate(file.name),
    rows_examined: 0,
    headings_detected: 0,
    repeated_headers: 0,
    ignored_rows: 0,
    duplicate_rows: 0,
    rows: [],
    warnings: [],
  };

  if (ext === "xlsx" || ext === "xls" || ext === "csv") {
    result.format = ext as SourceFormat;
    const wb = XLSX.read(buffer, { type: "array", cellDates: false });
    extractSheets(wb, result);
  } else if (ext === "pdf") {
    await extractPdf(buffer, result);
  } else {
    result.warnings.push(`Unsupported file type ".${ext}". Supply XLSX, XLS, CSV or PDF.`);
  }

  return result;
}
