import fs from "node:fs";
import { extractSupplierFile } from "../src/lib/catalogue-import/extract";

const files = [
  "Audio Visual Price List Catalogue July 2026.xlsx",
  "HA Price List July 2026 Collection.xlsx",
  "/tmp/imptest/edge-cases.xlsx",
  "/tmp/imptest/catalogue.csv",
  "/tmp/imptest/searchable.pdf",
  "/tmp/imptest/scanned.pdf",
];

for (const f of files) {
  const buf = fs.readFileSync(f);
  const file = new File([new Uint8Array(buf)], f.split("/").pop()!);
  const r = await extractSupplierFile(file);
  const products = r.rows.filter((x) => !x.ignored_as && !x.validation_error);
  const errors = r.rows.filter((x) => x.validation_error);
  console.log(`\n=== ${file.name} [${r.format}] checksum=${r.checksum.slice(0,10)}`);
  console.log(`   examined=${r.rows_examined} headings=${r.headings_detected} repeatedHeaders=${r.repeated_headers} ignored=${r.ignored_rows} duplicates=${r.duplicate_rows}`);
  console.log(`   valid products=${products.length} validation errors=${errors.length}`);
  if (r.warnings.length) console.log("   warnings:", r.warnings.join(" | ").slice(0,200));
  for (const e of errors.slice(0,5)) console.log(`     ! row ${e.source_row_number}: ${e.validation_error} (${e.supplier_sku ?? "-"})`);
  for (const p of products.slice(0,3)) console.log(`     + ${p.supplier_sku} | ${String(p.product_name).slice(0,40)} | promo=${p.promotional_price_ex_vat} | ${p.source_section ?? "-"}`);
}
