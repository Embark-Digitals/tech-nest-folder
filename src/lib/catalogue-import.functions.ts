import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Supplier catalogue update system — server side.
 *
 * The browser extracts rows deterministically and sends them here. All
 * matching, pricing preview, change detection and persistence happen on the
 * server. Selling prices are ALWAYS derived from the editable TechNest pricing
 * settings; a browser-supplied selling price is never accepted, and AI is
 * never used to calculate a price.
 */

const rowSchema = z.object({
  source_worksheet: z.string().nullable(),
  source_page: z.number().int().nullable(),
  source_row_number: z.number().int(),
  source_section: z.string().nullable(),
  supplier_sku: z.string().max(120).nullable(),
  model_number: z.string().max(120).nullable(),
  part_number: z.string().max(120).nullable(),
  product_name: z.string().max(500).nullable(),
  short_description: z.string().max(2000).nullable(),
  specifications_text: z.string().max(8000).nullable(),
  brand_raw: z.string().max(200).nullable().optional(),
  category_raw: z.string().max(200).nullable().optional(),
  availability_raw: z.string().max(300).nullable(),

  dealer_price_ex_vat: z.number().nullable(),
  promotional_price_ex_vat: z.number().nullable(),
  raw_row: z.record(z.string(), z.unknown()),
  validation_error: z.string().nullable(),
  ignored_as: z.string().nullable(),
});

const createSchema = z.object({
  file_name: z.string().min(1).max(300),
  checksum: z.string().length(64),
  storage_path: z.string().max(500).nullable(),
  supplier: z.string().max(120).nullable(),
  catalogue_date: z.string().max(20).nullable(),
  format: z.string().max(30),
  parser_version: z.string().max(80),
  rows_examined: z.number().int(),
  warnings: z.array(z.string()),
  is_test: z.boolean().default(false),
  /** Only an explicit administrator action may re-process an already-seen file. */
  force_reprocess: z.boolean().default(false),
  rows: z.array(rowSchema).max(20000),
});


type Row = z.infer<typeof rowSchema>;

const norm = (v: string | null | undefined) =>
  (v ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function similarity(a: string, b: string): number {
  const A = new Set(norm(a).split(" ").filter(Boolean));
  const B = new Set(norm(b).split(" ").filter(Boolean));
  if (!A.size || !B.size) return 0;
  let hits = 0;
  A.forEach((t) => B.has(t) && hits++);
  return (2 * hits) / (A.size + B.size);
}

function band(score: number): "high" | "medium" | "low" | "manual_review" {
  if (score >= 90) return "high";
  if (score >= 70) return "medium";
  if (score >= 50) return "low";
  return "manual_review";
}

/** Mirrors the database pricing trigger. Never hardcodes markup / VAT / rounding. */
export function computeSellingPrice(
  base: number | null,
  s: { markup_rate: number; vat_rate: number; rounding: string },
): number | null {
  if (base === null || base <= 0) return null;
  const ex = base * (1 + Number(s.markup_rate));
  const total = ex + ex * Number(s.vat_rate);
  switch (s.rounding) {
    case "nearest_rand":
      return Math.round(total);
    case "nearest_ten":
      return Math.round(total / 10) * 10;
    case "ends_99":
      return Math.floor(total) + 0.99;
    default:
      return Math.round(total * 100) / 100;
  }
}

const DISCONTINUED_RE = /\b(eol|end of life|discontinued|obsolete|delisted)\b/i;

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
  if (!data) throw new Error("Only administrators may run supplier catalogue imports.");
}

/* ================================================================== */
/* 1. Dry run — create the import batch and its proposed changes       */
/* ================================================================== */

export const createSupplierImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // --- duplicate file protection -------------------------------------
    // Checksum is compared against every previous batch, so re-uploading the
    // storage object cannot bypass this. Re-processing requires force_reprocess,
    // which the panel only sends after an explicit administrator confirmation.
    const { data: dupes } = await supabaseAdmin
      .from("catalogue_imports")
      .select("id, file_name, created_at, status")
      .eq("file_checksum", data.checksum)
      .order("created_at", { ascending: false })
      .limit(1);
    const dupe = dupes?.[0];
    if (dupe && !data.force_reprocess) {
      return {
        ok: false as const,
        duplicate: dupe,
        error: `This exact file (identical checksum) was already uploaded on ${new Date(dupe.created_at).toLocaleString("en-ZA")} as "${dupe.file_name}" (${dupe.status}). No duplicate batch was created.`,
      };
    }


    // --- pricing settings snapshot -------------------------------------
    const { data: pricing } = await supabaseAdmin
      .from("pricing_settings")
      .select("markup_rate, vat_rate, rounding, price_source")
      .order("created_at")
      .limit(1)
      .maybeSingle();
    if (!pricing) return { ok: false as const, error: "Pricing settings are not configured." };

    // --- existing catalogue index --------------------------------------
    const { data: products } = await supabaseAdmin
      .from("products")
      .select(
        "id, sku, supplier_sku, model_number, part_number, name, short_description, full_description, specifications_text, dealer_price_ex_vat, promotional_price_ex_vat, selling_price_incl_vat, source_availability_raw, brand_id, category_id, brand_verified, category_verified, is_published, is_discontinued",
      );
    const list = ((products ?? []) as unknown[]) as any[];
    const bySupplierSku = new Map<string, any>();
    const byModel = new Map<string, any>();
    const byPart = new Map<string, any>();
    const bySku = new Map<string, any>();
    const byName = new Map<string, any>();
    for (const p of list) {
      if (p.supplier_sku) bySupplierSku.set(p.supplier_sku.toUpperCase(), p);
      if (p.model_number) byModel.set(p.model_number.toUpperCase(), p);
      if (p.part_number) byPart.set(p.part_number.toUpperCase(), p);
      if (p.sku) bySku.set(p.sku.toUpperCase(), p);
      const n = norm(p.name);
      if (n && !byName.has(n)) byName.set(n, p);
    }

    // --- brand / category index (mapping proposals) ----------------------
    const { data: brandRows } = await supabaseAdmin.from("brands").select("id, name").eq("is_active", true);
    const { data: catRows } = await supabaseAdmin.from("categories").select("id, name").eq("is_active", true);
    const brandIndex = new Map<string, { id: string; name: string }>();
    for (const b of brandRows ?? []) brandIndex.set(norm(b.name), b as any);
    const catIndex = new Map<string, { id: string; name: string }>();
    for (const c of catRows ?? []) catIndex.set(norm(c.name), c as any);

    /** Resolve free text to an existing brand/category, exact then contained-token. */
    const resolve = (index: Map<string, { id: string; name: string }>, raw: string | null | undefined) => {
      const key = norm(raw);
      if (!key) return null;
      if (index.has(key)) return index.get(key)!;
      for (const [k, v] of index) if (k && (key === k || key.split(" ").includes(k))) return v;
      return null;
    };


    // --- create the batch ----------------------------------------------
    const { data: batch, error: batchError } = await supabaseAdmin
      .from("catalogue_imports")
      .insert({
        file_name: data.file_name,
        original_filename: data.file_name,
        file_checksum: data.checksum,
        storage_path: data.storage_path,
        supplier: data.supplier,
        catalogue_date: data.catalogue_date,
        parser_version: data.parser_version,
        extraction_method: data.format,
        pricing_snapshot: pricing,
        imported_by: context.userId,
        status: "previewing",
        total_rows: data.rows.length,
        rows_examined: data.rows_examined,
        warnings: data.warnings,
        is_test: data.is_test,
      })
      .select("id")
      .single();
    if (batchError || !batch) return { ok: false as const, error: batchError?.message ?? "Could not create import batch." };

    // --- build proposed changes -----------------------------------------
    const matchedIds = new Set<string>();
    const inserts = data.rows
      .filter((r) => !r.ignored_as || r.ignored_as === "duplicate")
      .map((r: Row) => {
        const base = {
          import_id: batch.id,
          source_worksheet: r.source_worksheet,
          source_page: r.source_page,
          source_row_number: r.source_row_number,
          source_section: r.source_section,
          supplier_sku: r.supplier_sku,
          model_number: r.model_number,
          part_number: r.part_number,
          product_name: r.product_name,
          raw_row: r.raw_row,
          normalised: {
            source_file: data.file_name,
            short_description: r.short_description,
            specifications_text: r.specifications_text,
            availability_raw: r.availability_raw,
            brand_raw: r.brand_raw ?? null,
            category_raw: r.category_raw ?? r.source_section ?? null,
            dealer_price_ex_vat: r.dealer_price_ex_vat,
            promotional_price_ex_vat: r.promotional_price_ex_vat,
            supplier_price_ex_vat: r.promotional_price_ex_vat ?? r.dealer_price_ex_vat,
            existing_price_incl_vat: null as number | null,
          },

          proposed_changes: {},
          ai_fields: {},
          matched_product_id: null as string | null,
          match_method: null as string | null,
          match_reason: null as string | null,
          match_confidence: null as number | null,
          validation_error: null as string | null,
          review_reason: null as string | null,
          computed_price_incl_vat: computeSellingPrice(r.promotional_price_ex_vat ?? r.dealer_price_ex_vat, pricing as any),
        };

        if (r.ignored_as === "duplicate" || r.validation_error) {
          return {
            ...base,
            change_type: r.ignored_as === "duplicate" ? "ignored" : "error",
            confidence_band: "manual_review",
            validation_error: r.validation_error,
            review_reason: r.validation_error ?? "Duplicate supplier code in the uploaded file",
            decision: "pending",
          };
        }

        const src = r.source_worksheet
          ? `${data.file_name} · ${r.source_worksheet} · row ${r.source_row_number}`
          : `${data.file_name} · page ${r.source_page} · line ${r.source_row_number}`;

        // ---- brand / category resolution --------------------------------
        const brandHit = resolve(brandIndex, r.brand_raw ?? r.product_name?.split(" ")[0] ?? null);
        const catHit = resolve(catIndex, r.category_raw ?? r.source_section ?? null);
        const mappingNotes: string[] = [];
        if ((r.brand_raw ?? "").trim() && !brandHit) mappingNotes.push(`Unknown brand "${r.brand_raw}" — no matching TechNest brand.`);
        if ((r.category_raw ?? r.source_section ?? "").trim() && !catHit)
          mappingNotes.push(`Unknown category "${r.category_raw ?? r.source_section}" — no matching TechNest category.`);

        // ---- matching priority ------------------------------------------
        const sku = (r.supplier_sku ?? "").toUpperCase();
        let match: any = null;
        let method = "";
        let score = 0;
        let ambiguousWith: string[] = [];
        if (sku && bySupplierSku.has(sku)) {
          match = bySupplierSku.get(sku); method = "supplier_sku"; score = 100;
        } else if (r.model_number && byModel.has(r.model_number.toUpperCase())) {
          match = byModel.get(r.model_number.toUpperCase()); method = "model_number"; score = 95;
        } else if (r.part_number && byPart.has(r.part_number.toUpperCase())) {
          match = byPart.get(r.part_number.toUpperCase()); method = "part_number"; score = 93;
        } else if (sku && bySku.has(sku)) {
          match = bySku.get(sku); method = "technest_sku"; score = 90;
        } else if (r.product_name && byName.has(norm(r.product_name))) {
          match = byName.get(norm(r.product_name)); method = "exact_normalised_name"; score = 78;
        } else if (r.product_name) {
          const scored = list
            .map((p) => ({ p, s: similarity(r.product_name!, p.name) }))
            .filter((x) => x.s >= 0.86)
            .sort((a, b) => b.s - a.s);
          // A supplier code that exists in no TechNest field is a NEW product.
          // Never let a loose name resemblance turn it into an update of a
          // different product — that silently rewrites the wrong record.
          if (scored.length && !sku) {
            match = scored[0].p; method = "probable_name_similarity"; score = Math.round(scored[0].s * 65);
            // Two or more near-identical candidates cannot be resolved safely.
            ambiguousWith = scored.filter((x) => scored[0].s - x.s <= 0.02).map((x) => x.p.name).slice(0, 4);
          } else if (scored.length) {
            mappingNotes.push(
              `Unrecognised supplier code "${r.supplier_sku}" — treated as a new product. Closest existing product: "${scored[0].p.name}" (${Math.round(scored[0].s * 100)}% name similarity). Reject this row if it is the same item under a new code.`,
            );
          }
        }


        if (!match) {
          const brandChanges: Record<string, any> = {};
          if (brandHit) brandChanges["brand_id"] = { old: null, new: brandHit.id, source: src, confidence: "medium", label: brandHit.name };
          if (catHit) brandChanges["category_id"] = { old: null, new: catHit.id, source: src, confidence: "medium", label: catHit.name };
          // A brand-new line that the supplier already marks end-of-life should
          // never be created as a live product without a human decision.
          const newButDead = DISCONTINUED_RE.test(r.availability_raw ?? "");
          if (newButDead)
            mappingNotes.push(
              `Supplier lists this new line as "${r.availability_raw}" — it will be created as discontinued and stay unpublished.`,
            );
          return {
            ...base,
            change_type: newButDead ? "discontinued" : "new",
            match_method: "none",
            match_reason: "No existing product matched on supplier code, model, part number, TechNest code or name.",
            match_confidence: 100,
            confidence_band: mappingNotes.length ? "medium" : "high",
            proposed_changes: brandChanges,
            review_reason: mappingNotes.join(" ") || null,
            decision: "pending",
          };
        }


        matchedIds.add(match.id);
        (base.normalised as any).existing_price_incl_vat = match.selling_price_incl_vat ?? null;

        if (ambiguousWith.length > 1) {
          return {
            ...base,
            matched_product_id: null,
            match_method: "ambiguous",
            match_reason: `Several existing products match this description equally well: ${ambiguousWith.join(" | ")}.`,
            match_confidence: score,
            confidence_band: "manual_review",
            change_type: "ambiguous",
            review_reason: "Ambiguous match — an administrator must pick the correct product before this row can be applied.",
            decision: "pending",
          };
        }

        const isDiscontinued = DISCONTINUED_RE.test(r.availability_raw ?? "");
        const changes: Record<string, { old: unknown; new: unknown; source: string; confidence: string; label?: string }> = {};

        const propose = (field: string, oldVal: unknown, newVal: unknown, confidence = band(score), label?: string) => {
          if (newVal === null || newVal === undefined || String(newVal).trim() === "") return; // never blank out
          if (String(oldVal ?? "") === String(newVal)) return;
          changes[field] = { old: oldVal ?? null, new: newVal, source: src, confidence, ...(label ? { label } : {}) };
        };

        // Low-confidence matches may never overwrite verified, filled values.
        const lowConfidence = score < 90;

        if (!lowConfidence) propose("name", match.name, r.product_name);
        // Do not replace a longer, filled description with a shorter extracted one
        if (!match.short_description || (r.short_description ?? "").length >= (match.short_description ?? "").length) {
          propose("short_description", match.short_description, r.short_description);
        }
        if (!match.specifications_text) propose("specifications_text", match.specifications_text, r.specifications_text);
        propose("dealer_price_ex_vat", match.dealer_price_ex_vat, r.dealer_price_ex_vat);
        propose("promotional_price_ex_vat", match.promotional_price_ex_vat, r.promotional_price_ex_vat);
        propose("source_availability_raw", match.source_availability_raw, r.availability_raw);
        if (brandHit && !match.brand_id && !match.brand_verified)
          propose("brand_id", match.brand_id, brandHit.id, "medium", brandHit.name);
        if (catHit && !match.category_id && !match.category_verified)
          propose("category_id", match.category_id, catHit.id, "medium", catHit.name);

        const changeType = isDiscontinued ? "discontinued" : Object.keys(changes).length ? "update" : "unchanged";

        const reasons = [
          method === "probable_name_similarity"
            ? "Loose name match — confirm this is the same product before approving."
            : null,
          lowConfidence ? "Low-confidence match: verified product names are never overwritten." : null,
          ...mappingNotes,
        ].filter(Boolean);

        return {
          ...base,
          matched_product_id: match.id,
          match_method: method,
          match_reason:
            method === "probable_name_similarity"
              ? `Probable match on product name only — requires approval before applying.`
              : `Matched on ${method.replace(/_/g, " ")}.`,
          match_confidence: score,
          confidence_band: band(score),
          change_type: changeType,
          proposed_changes: changes,
          review_reason: reasons.join(" ") || null,
          decision: "pending",
        };
      });


    for (let i = 0; i < inserts.length; i += 500) {
      const { error } = await supabaseAdmin.from("catalogue_import_rows").insert(inserts.slice(i, i + 500) as any);
      if (error) return { ok: false as const, error: error.message };
    }

    const counts = inserts.reduce<Record<string, number>>((acc, r: any) => {
      acc[r.change_type] = (acc[r.change_type] ?? 0) + 1;
      return acc;
    }, {});
    const reviewCount = inserts.filter((r: any) => r.confidence_band !== "high" || r.review_reason).length;

    // Products in the catalogue that this file did not mention. These are
    // listed for review as "missing" rows — never unpublished automatically.
    const absent = list.filter((p) => !matchedIds.has(p.id) && !p.is_discontinued).length;
    let missingRows = 0;
    if (data.supplier) {
      const { data: n } = await context.supabase.rpc("flag_absent_products", {
        _import_id: batch.id,
        _supplier: data.supplier,
      });
      missingRows = Number(n ?? 0);
    }

    await supabaseAdmin
      .from("catalogue_imports")
      .update({
        skipped_count: counts["ignored"] ?? 0,
        error_count: counts["error"] ?? 0,
        rejected_count: 0,
        review_count: reviewCount + missingRows,
        summary: { ...counts, missing: missingRows, absent_from_file: absent },
      })
      .eq("id", batch.id);

    return {
      ok: true as const,
      import_id: batch.id,
      counts: { ...counts, missing: missingRows },
      review_count: reviewCount + missingRows,
      absent_from_file: absent,
    };

  });

/* ================================================================== */
/* 2. Administrator decisions                                          */
/* ================================================================== */

export const decideImportRows = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        import_id: z.string().uuid(),
        decision: z.enum(["approved", "rejected", "kept_existing", "pending"]),
        row_ids: z.array(z.string().uuid()).max(20000).optional(),
        scope: z.enum(["selected", "all_high_confidence", "all"]).default("selected"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let q = supabaseAdmin
      .from("catalogue_import_rows")
      .update({ decision: data.decision, decided_by: context.userId, decided_at: new Date().toISOString() })
      .eq("import_id", data.import_id)
      .in("decision", ["pending", "approved", "rejected", "kept_existing"]);

    if (data.scope === "all_high_confidence") {
      q = q.eq("confidence_band", "high").in("change_type", ["new", "update", "discontinued"]);
    } else if (data.scope === "selected") {
      q = q.in("id", data.row_ids ?? []);
    } else {
      q = q.in("change_type", ["new", "update", "discontinued"]);
    }

    // Only applicable, valid rows may ever be approved — ambiguous, invalid,
    // duplicate and missing rows stay out of the apply set no matter what the
    // browser selected.
    if (data.decision === "approved") {
      q = q.in("change_type", ["new", "update", "discontinued"]).is("validation_error", null);
    }


    const { data: touched, error } = await q.select("id");
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, updated: touched?.length ?? 0 };
  });

export const overrideRowMatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ row_id: z.string().uuid(), product_id: z.string().uuid().nullable() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("catalogue_import_rows")
      .update({
        matched_product_id: data.product_id,
        match_method: data.product_id ? "administrator_override" : "none",
        match_reason: data.product_id ? "Match set manually by an administrator." : "Treated as a new product by an administrator.",
        match_confidence: 100,
        confidence_band: "high",
        change_type: data.product_id ? "update" : "new",
        decision: "pending",
      })
      .eq("id", data.row_id);
    return error ? { ok: false as const, error: error.message } : { ok: true as const };
  });

/* ================================================================== */
/* 3. Apply / rollback                                                 */
/* ================================================================== */

export const applySupplierImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ import_id: z.string().uuid(), flag_absent: z.boolean().default(true) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("apply_catalogue_import", { _import_id: data.import_id });
    if (error) return { ok: false as const, error: error.message };

    let flagged = 0;
    if (data.flag_absent) {
      const { data: n } = await context.supabase.rpc("flag_absent_products", {
        _import_id: data.import_id,
        _supplier: "",
      });
      flagged = Number(n ?? 0);
    }
    return { ok: true as const, ...(result as Record<string, number>), flagged_for_review: flagged };
  });


export const rollbackSupplierImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ import_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("rollback_catalogue_import", {
      _import_id: data.import_id,
    });
    return error ? { ok: false as const, error: error.message } : { ok: true as const, ...(result as Record<string, number>) };
  });

/* ================================================================== */
/* 4. AI assistance — never pricing                                    */
/* ================================================================== */

export const suggestRowMetadata = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ import_id: z.string().uuid(), limit: z.number().int().max(60).default(25) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: rows } = await supabaseAdmin
      .from("catalogue_import_rows")
      .select("id, product_name, supplier_sku, source_section, normalised")
      .eq("import_id", data.import_id)
      .in("confidence_band", ["low", "manual_review"])
      .limit(data.limit);
    if (!rows?.length) return { ok: true as const, enriched: 0 };

    const { data: brands } = await supabaseAdmin.from("brands").select("name").eq("is_active", true);
    const { data: cats } = await supabaseAdmin.from("categories").select("name").eq("is_active", true);

    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) return { ok: false as const, error: "AI gateway is not configured." };

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content:
              "You normalise South African consumer-electronics catalogue rows. Never invent or calculate prices. Reply with JSON only: {\"rows\":[{\"id\":string,\"product_name\":string,\"brand\":string|null,\"category\":string|null,\"confidence\":\"high\"|\"medium\"|\"low\"}]}. Use null when unsure.",
          },
          {
            role: "user",
            content: JSON.stringify({
              known_brands: (brands ?? []).map((b) => b.name),
              known_categories: (cats ?? []).map((c) => c.name),
              rows: rows.map((r) => ({ id: r.id, name: r.product_name, code: r.supplier_sku, section: r.source_section })),
            }),
          },
        ],
      }),
    });
    if (!response.ok) return { ok: false as const, error: `AI gateway error ${response.status}` };

    const json: any = await response.json();
    const text = json?.choices?.[0]?.message?.content ?? "{}";
    let parsed: any = {};
    try {
      parsed = JSON.parse(text.replace(/^```json\s*|\s*```$/g, ""));
    } catch {
      return { ok: false as const, error: "AI response could not be read." };
    }

    let enriched = 0;
    for (const s of parsed.rows ?? []) {
      const confidence = ["high", "medium", "low"].includes(s.confidence) ? s.confidence : "manual_review";
      const { error } = await supabaseAdmin
        .from("catalogue_import_rows")
        .update({
          ai_assisted: true,
          ai_fields: {
            product_name: s.product_name ?? null,
            brand: s.brand ?? null,
            category: s.category ?? null,
            confidence,
            model: "google/gemini-3-flash-preview",
          },
          confidence_band: confidence === "high" ? "medium" : "manual_review", // AI never yields high confidence on its own
          review_reason: "AI-assisted suggestion — confirm before approving.",
        })
        .eq("id", s.id)
        .eq("import_id", data.import_id);
      if (!error) enriched++;
    }
    return { ok: true as const, enriched };
  });
