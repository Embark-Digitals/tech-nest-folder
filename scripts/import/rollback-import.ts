/**
 * Rollback for a TechNest supplier staging import batch.
 * Removes ONLY records and storage objects created by the given batch.
 *
 * Usage: ROLLBACK_BATCH=<import_batch_id> bun run scripts/import/rollback-import.ts
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const batchId = process.env.ROLLBACK_BATCH;
if (!batchId) {
  console.error("Refused: set ROLLBACK_BATCH=<import_batch_id>");
  process.exit(1);
}

const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const manifestPath = path.resolve("import-reports", `rollback-manifest-${batchId}.json`);
if (!fs.existsSync(manifestPath)) {
  console.error(`Refused: manifest not found at ${manifestPath}`);
  process.exit(1);
}
const m = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

const productIds: string[] = m.products_created.map((p: any) => p.id);

// Storage objects created by this batch only.
if (m.storage_objects_created.length) {
  for (let i = 0; i < m.storage_objects_created.length; i += 100) {
    const { error } = await db.storage.from("product-images").remove(m.storage_objects_created.slice(i, i + 100));
    if (error) console.error("storage remove error:", error.message);
  }
}

for (let i = 0; i < productIds.length; i += 50) {
  const chunk = productIds.slice(i, i + 50);
  await db.from("product_images").delete().in("product_id", chunk);
  await db.from("product_specifications").delete().in("product_id", chunk);
  const { error } = await db.from("products").delete().in("id", chunk).eq("import_batch_id", batchId);
  if (error) console.error("product delete error:", error.message);
}

for (const c of [...m.categories_created].reverse()) await db.from("categories").delete().eq("id", c.id);
for (const b of m.brands_created) await db.from("brands").delete().eq("id", b.id);
await db.from("catalogue_imports").update({ status: "cancelled" }).eq("id", batchId);

console.log(`rolled back batch ${batchId}`);
