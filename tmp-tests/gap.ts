import fs from "node:fs";
import { extractSupplierFile } from "../src/lib/catalogue-import/extract";
for (const f of ["Audio Visual Price List Catalogue July 2026.xlsx","HA Price List July 2026 Collection.xlsx"]) {
  const r = await extractSupplierFile(new File([new Uint8Array(fs.readFileSync(f))], f));
  console.log("\n###", f);
  for (const row of r.rows) {
    if (!row.ignored_as) continue;
    const cells = (row.raw_row as any).cells as string[];
    const joined = cells.filter(Boolean).join(" | ");
    // a likely product row: has a code-ish token and a number
    if (/\d/.test(joined) && joined.length > 30 && row.ignored_as !== "repeated_header" && row.ignored_as !== "header")
      console.log(`  [${row.ignored_as}] r${row.source_row_number}: ${joined.slice(0,130)}`);
  }
}
