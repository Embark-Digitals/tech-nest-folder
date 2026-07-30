/**
 * TechNest supplier catalogue STAGING import.
 * One-time internal utility. Requires STAGING_IMPORT=true and service-level credentials
 * supplied through the environment (never committed). Not reachable from any app route.
 *
 * Usage: STAGING_IMPORT=true bun run scripts/import/stage-import.ts
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { parseWorkbooks, type ParsedProduct } from "./parse-workbooks";

const STAGING_IMPORT = process.env.STAGING_IMPORT === "true";
if (!STAGING_IMPORT) {
  console.error("Refused: staging import requires STAGING_IMPORT=true");
  process.exit(1);
}
if (process.env.DRY_RUN === "true") {
  console.error("Refused: DRY_RUN=true must not be used for write operations");
  process.exit(1);
}

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Refused: service-level credentials are not present in the environment");
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const BASELINE = {
  A: 82,
  B: 93,
  combined: 175,
  with_promo: 173,
  pricing_review: 2,
  with_images: 172,
  without_images: 3,
  existing: 18,
};

const BUCKET = "product-images";
const OUT_DIR = path.resolve("import-reports");
const WORK_DIR = path.resolve(".import-work");
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(WORK_DIR, { recursive: true });

const fail = (msg: string, detail?: unknown) => {
  fs.writeFileSync(path.join(OUT_DIR, "technest-staging-error.json"), JSON.stringify({ at: new Date().toISOString(), msg, detail }, null, 2));
  console.error("STOPPED:", msg, detail ?? "");
  process.exit(1);
};

const slugify = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "item";
const normName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

const manifest = {
  import_batch_id: "",
  started_at: new Date().toISOString(),
  completed_at: null as string | null,
  categories_created: [] as { id: string; name: string }[],
  brands_created: [] as { id: string; name: string }[],
  products_created: [] as { id: string; sku: string }[],
  product_images_created: [] as { id: string; product_id: string }[],
  product_specifications_created: 0,
  storage_objects_created: [] as string[],
};
const writeManifest = () =>
  fs.writeFileSync(path.join(OUT_DIR, `rollback-manifest-${manifest.import_batch_id || "pending"}.json`), JSON.stringify(manifest, null, 2));

async function main() {
  // ---------- PARSE ----------
  const { products, perBook } = await parseWorkbooks();

  // ---------- BASELINE CHECK ----------
  const withPromo = products.filter((p) => p.promotional_price_ex_vat != null).length;
  const withImages = products.filter((p) => p.image).length;
  const skus = products.map((p) => p.normalised_sku);
  const dupes = skus.filter((s, i) => skus.indexOf(s) !== i);
  const deviation: string[] = [];
  if (perBook.A.valid_products !== BASELINE.A) deviation.push(`workbook A ${perBook.A.valid_products} != ${BASELINE.A}`);
  if (perBook.B.valid_products !== BASELINE.B) deviation.push(`workbook B ${perBook.B.valid_products} != ${BASELINE.B}`);
  if (products.length !== BASELINE.combined) deviation.push(`combined ${products.length} != ${BASELINE.combined}`);
  if (withPromo !== BASELINE.with_promo) deviation.push(`with promo price ${withPromo} != ${BASELINE.with_promo}`);
  if (withImages !== BASELINE.with_images) deviation.push(`with images ${withImages} != ${BASELINE.with_images}`);
  if (dupes.length) deviation.push(`duplicate SKUs: ${dupes.join(", ")}`);
  if (deviation.length) fail("dry-run baseline deviation", deviation);

  // ---------- PRE-IMPORT SAFETY CHECKS ----------
  const checks: Record<string, unknown> = {};
  const { data: existing, error: exErr } = await db.from("products").select("id, sku, updated_at");
  if (exErr) fail("cannot read existing products", exErr);
  checks["1_existing_product_count"] = existing!.length;
  if (existing!.length !== BASELINE.existing) fail("existing product count is not 18", existing!.length);
  checks["2_existing_skus_tn_format"] = existing!.every((p) => /^TN-/.test(p.sku));
  if (!checks["2_existing_skus_tn_format"]) fail("existing SKUs are not all TN-*");
  const existingUpper = new Set(existing!.map((p) => p.sku.toUpperCase()));
  const collisions = skus.filter((s) => existingUpper.has(s));
  checks["3_supplier_sku_collisions"] = collisions;
  if (collisions.length) fail("supplier SKU already exists", collisions);

  const { data: settings, error: setErr } = await db.from("pricing_settings").select("*").limit(1).maybeSingle();
  if (setErr || !settings) fail("cannot read pricing_settings", setErr);
  checks["4_pricing_settings_readable"] = true;
  const markup = Number(settings!.markup_rate);
  const vat = Number(settings!.vat_rate);
  checks["5_markup_rate"] = markup;
  checks["6_vat_rate"] = vat;
  if (markup !== 0.2) fail("markup is not 20%", markup);
  if (vat !== 0.15) fail("VAT is not 15%", vat);

  const { data: buckets, error: bErr } = await db.storage.listBuckets();
  if (bErr) fail("cannot list storage buckets", bErr);
  const bucket = buckets!.find((b) => b.name === BUCKET);
  if (!bucket) fail(`storage bucket "${BUCKET}" is missing`);
  checks["7_bucket"] = { name: BUCKET, public: bucket!.public };
  checks["8_credentials"] = "service-role key read from environment; script is CLI-only and not routable";

  // ---------- IMPORT BATCH ----------
  const { data: batch, error: batchErr } = await db
    .from("catalogue_imports")
    .insert({
      file_name: "Audio Visual Price List Catalogue July 2026.xlsx + HA Price List July 2026 Collection.xlsx",
      status: "pending",
      total_rows: products.length,
      summary: { mode: "staging_import", baseline: BASELINE, checks },
    })
    .select("id")
    .single();
  if (batchErr) fail("cannot create import batch", batchErr);
  const batchId = batch!.id as string;
  manifest.import_batch_id = batchId;
  writeManifest();
  console.log("import batch:", batchId);

  try {
    // ---------- BRANDS ----------
    const { data: brandRows } = await db.from("brands").select("id, name");
    const brandByName = new Map(brandRows!.map((b) => [normName(b.name), b.id as string]));
    const brandsNeeded = [...new Set(products.map((p) => p.brand).filter(Boolean) as string[])];
    const brandsReused: string[] = [];
    for (const name of brandsNeeded) {
      if (brandByName.has(normName(name))) {
        brandsReused.push(name);
        continue;
      }
      const { data, error } = await db.from("brands").insert({ name, slug: slugify(name), is_active: true }).select("id").single();
      if (error) throw new Error(`brand insert failed (${name}): ${error.message}`);
      brandByName.set(normName(name), data!.id);
      manifest.brands_created.push({ id: data!.id, name });
    }
    writeManifest();

    // ---------- CATEGORIES ----------
    const { data: catRows } = await db.from("categories").select("id, name, parent_id");
    const catKey = (name: string, parentId: string | null) => `${parentId ?? "root"}::${normName(name)}`;
    const catMap = new Map(catRows!.map((c) => [catKey(c.name, c.parent_id), c.id as string]));
    const categoriesReused: string[] = [];
    const ensureCategory = async (name: string, parentId: string | null, section: string | null) => {
      const key = catKey(name, parentId);
      const hit = catMap.get(key);
      if (hit) {
        if (!categoriesReused.includes(name)) categoriesReused.push(name);
        return hit;
      }
      const { data, error } = await db
        .from("categories")
        .insert({ name, slug: slugify(name), parent_id: parentId, is_active: true, description: section ? `Supplier catalogue section: ${section}` : null })
        .select("id")
        .single();
      if (error) throw new Error(`category insert failed (${name}): ${error.message}`);
      catMap.set(key, data!.id);
      manifest.categories_created.push({ id: data!.id, name });
      return data!.id as string;
    };

    const catIds = new Map<string, { parent: string; child: string }>();
    for (const p of products) {
      if (!p.parent_category || !p.category) throw new Error(`unmapped category for ${p.sku}`);
      const key = `${p.parent_category}>${p.category}`;
      if (catIds.has(key)) continue;
      const parentId = await ensureCategory(p.parent_category, null, null);
      const childId = await ensureCategory(p.category, parentId, p.source_section);
      catIds.set(key, { parent: parentId, child: childId });
    }
    writeManifest();

    // ---------- PRODUCTS ----------
    const usedSlugs = new Set<string>();
    const rows = products.map((p: ParsedProduct) => {
      let slug = slugify(`${p.name} ${p.sku}`);
      while (usedSlugs.has(slug)) slug = `${slug}-x`;
      usedSlugs.add(slug);
      const cat = catIds.get(`${p.parent_category}>${p.category}`)!;
      const brandId = p.brand ? brandByName.get(normName(p.brand))! : null;
      return {
        sku: p.sku,
        name: p.name,
        slug,
        brand_id: brandId,
        brand_review_required: p.brand === null,
        category_id: cat.parent,
        subcategory_id: cat.child,
        short_description: p.short_description,
        full_description: p.short_description,
        specifications_text: p.specifications_text,
        supplier_availability: p.supplier_availability as never,
        source_availability_raw: p.supplier_availability_raw,
        supplier_availability_note: p.supplier_availability_raw,
        stock_status: p.stock_status as never,
        // Supplier costs: promotional price drives pricing; dealer price is cost-only.
        promotional_price_ex_vat: p.promotional_price_ex_vat,
        dealer_price_ex_vat: p.dealer_price_ex_vat,
        markup_rate: markup,
        vat_rate: vat,
        is_clearance: p.is_clearance,
        is_new_arrival: p.is_new_arrival,
        is_discontinued: p.is_discontinued,
        is_published: false,
        image_required: !p.image,
        import_batch_id: batchId,
        import_status: "staged",
        source_type: "supplier_catalogue",
        source_workbook: p.source_workbook,
        source_worksheet: p.source_worksheet,
        source_row_number: p.source_row_number,
        source_section: p.source_section,
      };
    });

    const idBySku = new Map<string, string>();
    for (let i = 0; i < rows.length; i += 25) {
      const chunk = rows.slice(i, i + 25);
      const { data, error } = await db.from("products").insert(chunk).select("id, sku");
      if (error) throw new Error(`product insert failed at row ${i}: ${error.message}`);
      for (const r of data!) {
        idBySku.set(r.sku.toUpperCase(), r.id);
        manifest.products_created.push({ id: r.id, sku: r.sku });
      }
      writeManifest();
      console.log(`inserted ${manifest.products_created.length}/${rows.length}`);
    }

    // ---------- SPECIFICATIONS ----------
    const specRows: { product_id: string; spec_key: string; spec_value: string; sort_order: number }[] = [];
    for (const p of products) {
      const id = idBySku.get(p.normalised_sku)!;
      let i = 0;
      for (const [k, v] of Object.entries(p.specifications)) specRows.push({ product_id: id, spec_key: k, spec_value: v, sort_order: i++ });
    }
    for (let i = 0; i < specRows.length; i += 200) {
      const { error } = await db.from("product_specifications").insert(specRows.slice(i, i + 200));
      if (error) throw new Error(`spec insert failed: ${error.message}`);
      manifest.product_specifications_created += specRows.slice(i, i + 200).length;
    }
    writeManifest();

    // ---------- IMAGES ----------
    const imageFailures: { sku: string; error: string }[] = [];
    let extracted = 0;
    let uploaded = 0;
    for (const p of products) {
      if (!p.image) continue;
      extracted++;
      const nsku = slugify(p.normalised_sku);
      const ext = ["png", "jpg", "jpeg", "gif", "webp"].includes(p.image.extension) ? p.image.extension : "png";
      const local = path.join(WORK_DIR, `${nsku}-primary.${ext}`);
      fs.writeFileSync(local, p.image.buffer);
      // Optimise only oversized files, preserving format and transparency.
      if (p.image.buffer.length > 400_000) {
        spawnSync("python3", ["scripts/import/optimise-image.py", local], { stdio: "inherit" });
      }
      const body = fs.readFileSync(local);
      const objectPath = `products/${nsku}/primary.${ext}`;
      const { error: upErr } = await db.storage.from(BUCKET).upload(objectPath, body, {
        contentType: ext === "png" ? "image/png" : ext === "gif" ? "image/gif" : ext === "webp" ? "image/webp" : "image/jpeg",
        upsert: true,
      });
      if (upErr) {
        imageFailures.push({ sku: p.sku, error: upErr.message });
        continue;
      }
      manifest.storage_objects_created.push(objectPath);
      uploaded++;
      const { data: img, error: imgErr } = await db
        .from("product_images")
        .insert({
          product_id: idBySku.get(p.normalised_sku)!,
          url: objectPath,
          alt_text: p.name,
          is_primary: true,
          sort_order: 0,
        })
        .select("id")
        .single();
      if (imgErr) {
        imageFailures.push({ sku: p.sku, error: imgErr.message });
        continue;
      }
      manifest.product_images_created.push({ id: img!.id, product_id: idBySku.get(p.normalised_sku)! });
      if (uploaded % 25 === 0) {
        writeManifest();
        console.log(`uploaded ${uploaded}/${extracted}`);
      }
    }
    writeManifest();

    // ---------- VERIFICATION ----------
    const { data: created } = await db
      .from("products")
      .select("id, sku, name, promotional_price_ex_vat, selling_price_incl_vat, pricing_review_required, brand_review_required, image_required, is_published, import_status")
      .eq("import_batch_id", batchId);
    const { count: finalCount } = await db.from("products").select("id", { count: "exact", head: true });
    const { data: untouched } = await db.from("products").select("id, sku, updated_at").is("import_batch_id", null);

    const samples = products
      .filter((p) => p.promotional_price_ex_vat)
      .filter((_, i) => i % 17 === 0)
      .slice(0, 12)
      .map((p) => {
        const row = created!.find((c) => c.sku.toUpperCase() === p.normalised_sku)!;
        const expected = Math.round(p.promotional_price_ex_vat! * (1 + markup) * (1 + vat) * 100) / 100;
        return {
          workbook: p.workbook_label,
          sku: p.sku,
          promo_ex_vat: p.promotional_price_ex_vat,
          expected_incl_vat: expected,
          stored_incl_vat: Number(row.selling_price_incl_vat),
          matches: Math.abs(Number(row.selling_price_incl_vat) - expected) < 0.01,
        };
      });

    const verification = {
      existing_products_before_import: BASELINE.existing,
      supplier_products_created: created!.length,
      supplier_products_updated: 0,
      final_products: finalCount,
      new_supplier_products_published: created!.filter((c) => c.is_published).length,
      new_supplier_products_staged: created!.filter((c) => c.import_status === "staged").length,
      products_with_valid_prices: created!.filter((c) => c.selling_price_incl_vat != null).length,
      pricing_review_products: created!.filter((c) => c.pricing_review_required).length,
      products_with_uploaded_images: manifest.product_images_created.length,
      products_requiring_images: created!.filter((c) => c.image_required).length,
      brand_review_products: created!.filter((c) => c.brand_review_required).length,
      duplicate_supplier_skus: 0,
      original_products_unchanged: untouched!.length === BASELINE.existing && untouched!.every((p) => /^TN-/.test(p.sku)),
      sample_price_checks_passed: samples.every((s) => s.matches),
      image_failures: imageFailures,
    };

    const problems: string[] = [];
    if (verification.supplier_products_created !== BASELINE.combined) problems.push("created count mismatch");
    if (verification.final_products !== BASELINE.existing + BASELINE.combined) problems.push("final count mismatch");
    if (verification.new_supplier_products_published !== 0) problems.push("something was published");
    if (verification.products_with_valid_prices !== BASELINE.with_promo) problems.push("priced count mismatch");
    if (verification.pricing_review_products !== BASELINE.pricing_review) problems.push("pricing review count mismatch");
    if (verification.products_with_uploaded_images !== BASELINE.with_images) problems.push("uploaded image count mismatch");
    if (!verification.sample_price_checks_passed) problems.push("sample price checks failed");
    if (!verification.original_products_unchanged) problems.push("existing products changed");
    if (problems.length) throw new Error(`post-import verification failed: ${problems.join("; ")}`);

    manifest.completed_at = new Date().toISOString();
    writeManifest();

    await db
      .from("catalogue_imports")
      .update({
        status: "completed",
        created_count: created!.length,
        updated_count: 0,
        skipped_count: 0,
        error_count: imageFailures.length,
        summary: { mode: "staging_import", checks, verification, samples, categories_reused: categoriesReused, brands_reused: brandsReused, categories_created: manifest.categories_created.map((c) => c.name), brands_created: manifest.brands_created.map((b) => b.name) },
      })
      .eq("id", batchId);

    const report = {
      import_batch_id: batchId,
      started_at: manifest.started_at,
      completed_at: manifest.completed_at,
      workbooks_processed: Object.values(perBook).map((s) => s.workbook),
      rows_examined: Object.values(perBook).reduce((a, s) => a + s.rows_examined, 0),
      products_created: created!.length,
      products_updated: 0,
      products_skipped: 0,
      categories_reused: categoriesReused,
      categories_created: manifest.categories_created.map((c) => c.name),
      brands_reused: brandsReused,
      brands_created: manifest.brands_created.map((b) => b.name),
      products_with_confirmed_brand: created!.filter((c) => !c.brand_review_required).length,
      products_requiring_brand_review: created!.filter((c) => c.brand_review_required).length,
      images_extracted: extracted,
      images_uploaded: uploaded,
      images_failed: imageFailures.length,
      products_without_images: created!.filter((c) => c.image_required).length,
      products_with_valid_prices: verification.products_with_valid_prices,
      products_requiring_pricing_review: verification.pricing_review_products,
      sample_price_calculations: samples,
      database_records_created:
        manifest.products_created.length + manifest.product_images_created.length + manifest.product_specifications_created + manifest.categories_created.length + manifest.brands_created.length + 1,
      storage_objects_created: manifest.storage_objects_created.length,
      verification,
      rollback_command: `ROLLBACK_BATCH=${batchId} bun run scripts/import/rollback-import.ts`,
      final_product_count: verification.final_products,
    };
    fs.writeFileSync(path.join(OUT_DIR, `technest-staging-report-${batchId}.json`), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } catch (e: any) {
    console.error("FAILED:", e.message);
    await db.from("catalogue_imports").update({ status: "failed", summary: { error: e.message } }).eq("id", batchId);
    writeManifest();
    console.error(`Rollback: ROLLBACK_BATCH=${batchId} bun run scripts/import/rollback-import.ts`);
    process.exit(1);
  }
}

main();
