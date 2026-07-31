import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, FileUp, Loader2, RotateCcw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { formatZAR } from "@/lib/format";
import { extractSupplierFile, type ExtractionResult } from "@/lib/catalogue-import/extract";
import {
  applySupplierImport,
  createSupplierImport,
  decideImportRows,
  rollbackSupplierImport,
  suggestRowMetadata,
} from "@/lib/catalogue-import.functions";

const FORMAT_SUPPORT: Record<string, { label: string; tone: string }> = {
  xlsx: { label: "Fully supported", tone: "bg-emerald-100 text-emerald-800" },
  xls: { label: "Fully supported", tone: "bg-emerald-100 text-emerald-800" },
  csv: { label: "Fully supported", tone: "bg-emerald-100 text-emerald-800" },
  pdf_text: { label: "Manual review required", tone: "bg-amber-100 text-amber-900" },
  pdf_scanned: { label: "Unsupported (no text layer)", tone: "bg-red-100 text-red-800" },
  unsupported: { label: "Unsupported", tone: "bg-red-100 text-red-800" },
};

const BAND_TONE: Record<string, string> = {
  high: "bg-emerald-100 text-emerald-800",
  medium: "bg-sky-100 text-sky-800",
  low: "bg-amber-100 text-amber-900",
  manual_review: "bg-red-100 text-red-800",
};

const CHANGE_TONE: Record<string, string> = {
  new: "bg-emerald-100 text-emerald-800",
  update: "bg-sky-100 text-sky-800",
  unchanged: "bg-muted text-muted-foreground",
  discontinued: "bg-amber-100 text-amber-900",
  ambiguous: "bg-amber-100 text-amber-900",
  error: "bg-red-100 text-red-800",
  ignored: "bg-muted text-muted-foreground",
};

export function SupplierImportPanel({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const [extraction, setExtraction] = useState<ExtractionResult | null>(null);
  const [fileName, setFileName] = useState("");
  const [supplier, setSupplier] = useState("");
  const [isTest, setIsTest] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [activeImport, setActiveImport] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const create = useServerFn(createSupplierImport);
  const decide = useServerFn(decideImportRows);
  const apply = useServerFn(applySupplierImport);
  const rollback = useServerFn(rollbackSupplierImport);
  const enrich = useServerFn(suggestRowMetadata);

  const imports = useQuery({
    queryKey: ["supplier-imports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("catalogue_imports")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
  });

  const rows = useQuery({
    queryKey: ["import-rows", activeImport, filter],
    enabled: !!activeImport,
    queryFn: async () => {
      let q = supabase
        .from("catalogue_import_rows")
        .select("*")
        .eq("import_id", activeImport!)
        .order("source_row_number")
        .limit(600);
      if (filter !== "all") q = q.eq("change_type", filter as never);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const summary = useMemo(() => {
    const batch = imports.data?.find((b) => b.id === activeImport);
    return (batch?.summary ?? null) as Record<string, number> | null;
  }, [imports.data, activeImport]);

  async function handleFile(file: File) {
    setBusy("Reading file…");
    setPendingFile(file);
    setFileName(file.name);
    try {
      const result = await extractSupplierFile(file);
      setExtraction(result);
      if (result.format === "pdf_scanned" || result.format === "unsupported") {
        toast.error(result.warnings[0] ?? "This file type cannot be imported.");
      } else {
        toast.success(`Extracted ${result.rows.filter((r) => !r.ignored_as).length} candidate product rows.`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Extraction failed.");
      setExtraction(null);
    } finally {
      setBusy(null);
    }
  }

  const runDryRun = useMutation({
    mutationFn: async () => {
      if (!extraction || !pendingFile) throw new Error("Upload a file first.");
      setBusy("Storing the original file…");
      const storagePath = `${extraction.checksum}/${pendingFile.name}`;
      const upload = await supabase.storage
        .from("supplier-catalogues")
        .upload(storagePath, pendingFile, { upsert: true, contentType: pendingFile.type || "application/octet-stream" });
      if (upload.error && !/already exists/i.test(upload.error.message)) throw upload.error;

      setBusy("Comparing against the live catalogue…");
      return create({
        data: {
          file_name: pendingFile.name,
          checksum: extraction.checksum,
          storage_path: storagePath,
          supplier: supplier.trim() || null,
          catalogue_date: extraction.catalogue_date,
          format: extraction.format,
          parser_version: extraction.parser_version,
          rows_examined: extraction.rows_examined,
          warnings: extraction.warnings,
          is_test: isTest,
          rows: extraction.rows.filter((r) => !r.ignored_as || r.ignored_as === "duplicate"),
        },
      });
    },
    onSuccess: (res: any) => {
      setBusy(null);
      if (!res.ok) {
        toast.error(res.duplicate ? `Duplicate upload — this file was already imported on ${new Date(res.duplicate.created_at).toLocaleDateString("en-ZA")}.` : res.error);
        return;
      }
      setActiveImport(res.import_id);
      qc.invalidateQueries({ queryKey: ["supplier-imports"] });
      toast.success("Dry run complete — review the proposed changes below.");
    },
    onError: (e: Error) => { setBusy(null); toast.error(e.message); },
  });

  const run = async (label: string, fn: () => Promise<any>, done: string) => {
    setBusy(label);
    try {
      const res = await fn();
      if (res?.ok === false) throw new Error(res.error);
      toast.success(done);
      qc.invalidateQueries({ queryKey: ["import-rows"] });
      qc.invalidateQueries({ queryKey: ["supplier-imports"] });
      qc.invalidateQueries({ queryKey: ["admin-products"] });
      setSelected(new Set());
      return res;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setBusy(null);
    }
  };

  const support = extraction ? FORMAT_SUPPORT[extraction.format] : null;

  return (
    <div className="space-y-6">
      {/* ---------------- upload ---------------- */}
      <Card className="p-6">
        <h3 className="font-display text-lg font-semibold">Supplier catalogue update</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload the newest supplier price list. Nothing changes in the live catalogue until you approve it.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <Label htmlFor="supplier-file">Catalogue file (XLSX, XLS, CSV or PDF)</Label>
            <Input
              id="supplier-file"
              type="file"
              accept=".xlsx,.xls,.csv,.pdf"
              className="mt-1"
              disabled={!isAdmin || !!busy}
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
          </div>
          <div>
            <Label htmlFor="supplier-name">Supplier</Label>
            <Input id="supplier-name" className="mt-1" value={supplier} maxLength={120}
              onChange={(e) => setSupplier(e.target.value)} placeholder="e.g. Hisense SA" />
          </div>
        </div>

        <label className="mt-3 flex items-center gap-2 text-sm">
          <Checkbox checked={isTest} onCheckedChange={(v) => setIsTest(!!v)} />
          Label this batch as a test import
        </label>

        {extraction && (
          <div className="mt-4 rounded-lg border bg-muted/30 p-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <FileUp className="h-4 w-4" />
              <strong>{fileName}</strong>
              {support && <Badge className={support.tone}>{support.label}</Badge>}
              <span className="text-muted-foreground">checksum {extraction.checksum.slice(0, 12)}…</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
              <Stat label="Rows examined" value={extraction.rows_examined} />
              <Stat label="Headings" value={extraction.headings_detected} />
              <Stat label="Repeated headers" value={extraction.repeated_headers} />
              <Stat label="Ignored rows" value={extraction.ignored_rows} />
              <Stat label="Duplicate rows" value={extraction.duplicate_rows} />
            </div>
            {extraction.warnings.map((w) => (
              <p key={w} className="mt-2 flex gap-2 text-amber-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{w}
              </p>
            ))}
            <Button
              className="mt-4"
              disabled={!isAdmin || !!busy || extraction.format === "pdf_scanned" || extraction.format === "unsupported"}
              onClick={() => runDryRun.mutate()}
            >
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {busy ?? "Run dry-run comparison"}
            </Button>
          </div>
        )}
      </Card>

      {/* ---------------- dry-run review ---------------- */}
      {activeImport && (
        <Card className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-display text-lg font-semibold">Proposed changes</h3>
            <div className="flex flex-wrap gap-2">
              <Select value={filter} onValueChange={setFilter}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["all", "new", "update", "unchanged", "discontinued", "error", "ignored"].map((f) => (
                    <SelectItem key={f} value={f}>{f === "all" ? "All rows" : f}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" disabled={!isAdmin || !!busy}
                onClick={() => run("Asking AI…", () => enrich({ data: { import_id: activeImport, limit: 25 } }), "AI suggestions added for low-confidence rows.")}>
                <Sparkles className="mr-1 h-4 w-4" />AI suggestions
              </Button>
            </div>
          </div>

          {summary && (
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
              {Object.entries(summary).map(([k, v]) => <Stat key={k} label={k.replace(/_/g, " ")} value={v} />)}
            </div>
          )}

          <Separator className="my-4" />

          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={!isAdmin || !!busy}
              onClick={() => run("Approving…", () => decide({ data: { import_id: activeImport, decision: "approved", scope: "all_high_confidence" } }), "All high-confidence rows approved.")}>
              Approve all high confidence
            </Button>
            <Button size="sm" variant="outline" disabled={!isAdmin || !!busy || !selected.size}
              onClick={() => run("Approving…", () => decide({ data: { import_id: activeImport, decision: "approved", scope: "selected", row_ids: [...selected] } }), `${selected.size} rows approved.`)}>
              Approve selected ({selected.size})
            </Button>
            <Button size="sm" variant="outline" disabled={!isAdmin || !!busy || !selected.size}
              onClick={() => run("Rejecting…", () => decide({ data: { import_id: activeImport, decision: "rejected", scope: "selected", row_ids: [...selected] } }), `${selected.size} rows rejected.`)}>
              Reject selected
            </Button>
            <Button size="sm" variant="outline" disabled={!isAdmin || !!busy || !selected.size}
              onClick={() => run("Keeping…", () => decide({ data: { import_id: activeImport, decision: "kept_existing", scope: "selected", row_ids: [...selected] } }), "Existing values kept.")}>
              Keep existing values
            </Button>
            <Button size="sm" variant="destructive" disabled={!isAdmin || !!busy}
              onClick={() => run("Rejecting all…", () => decide({ data: { import_id: activeImport, decision: "rejected", scope: "all" } }), "Entire import rejected.")}>
              Reject entire import
            </Button>
            <Button size="sm" className="ml-auto" disabled={!isAdmin || !!busy}
              onClick={() => run("Applying…", () => apply({ data: { import_id: activeImport, flag_absent: true } }), "Approved changes applied.")}>
              <CheckCircle2 className="mr-1 h-4 w-4" />Apply approved changes
            </Button>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="border-b text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="w-8 p-2" />
                  <th className="p-2">Source</th>
                  <th className="p-2">Supplier code / name</th>
                  <th className="p-2">Change</th>
                  <th className="p-2">Match &amp; confidence</th>
                  <th className="p-2">Proposed changes</th>
                  <th className="p-2 text-right">New customer price</th>
                  <th className="p-2">Decision</th>
                </tr>
              </thead>
              <tbody>
                {rows.data?.map((r: any) => (
                  <tr key={r.id} className="border-b align-top">
                    <td className="p-2">
                      <Checkbox
                        checked={selected.has(r.id)}
                        onCheckedChange={(v) => {
                          const next = new Set(selected);
                          v ? next.add(r.id) : next.delete(r.id);
                          setSelected(next);
                        }}
                      />
                    </td>
                    <td className="p-2 text-xs text-muted-foreground">
                      {r.source_worksheet ?? `page ${r.source_page}`}<br />row {r.source_row_number}
                      {r.source_section && <div className="mt-1 italic">{r.source_section}</div>}
                    </td>
                    <td className="p-2">
                      <div className="font-medium">{r.supplier_sku ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{r.product_name ?? "—"}</div>
                      {r.ai_assisted && <Badge className="mt-1 bg-violet-100 text-violet-800">AI-assisted</Badge>}
                    </td>
                    <td className="p-2"><Badge className={CHANGE_TONE[r.change_type]}>{r.change_type}</Badge></td>
                    <td className="p-2 text-xs">
                      <Badge className={BAND_TONE[r.confidence_band]}>{r.confidence_band.replace("_", " ")}</Badge>
                      <div className="mt-1 text-muted-foreground">{r.match_reason ?? r.validation_error ?? "—"}</div>
                      {r.match_confidence != null && <div className="text-muted-foreground">score {r.match_confidence}</div>}
                      {r.review_reason && <div className="mt-1 text-amber-800">{r.review_reason}</div>}
                    </td>
                    <td className="p-2 text-xs">
                      {Object.keys(r.proposed_changes ?? {}).length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        Object.entries(r.proposed_changes as Record<string, any>).map(([field, c]) => (
                          <div key={field} className="mb-1">
                            <span className="font-medium">{field.replace(/_/g, " ")}</span>:{" "}
                            <span className="line-through text-muted-foreground">{String(c.old ?? "—").slice(0, 60)}</span>{" → "}
                            <span className="text-foreground">{String(c.new).slice(0, 60)}</span>
                            <div className="text-muted-foreground">{c.source}</div>
                          </div>
                        ))
                      )}
                    </td>
                    <td className="p-2 text-right font-medium">
                      {r.computed_price_incl_vat ? formatZAR(Number(r.computed_price_incl_vat)) : "—"}
                    </td>
                    <td className="p-2"><Badge variant="outline">{r.decision}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.isLoading && <p className="p-4 text-sm text-muted-foreground">Loading rows…</p>}
            {rows.data?.length === 0 && <p className="p-4 text-sm text-muted-foreground">No rows for this filter.</p>}
          </div>
        </Card>
      )}

      {/* ---------------- history ---------------- */}
      <Card className="p-6">
        <h3 className="font-display text-lg font-semibold">Import history &amp; audit trail</h3>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[800px] text-sm">
            <thead className="border-b text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-2">File</th><th className="p-2">Supplier</th><th className="p-2">Uploaded</th>
                <th className="p-2">Status</th><th className="p-2">Rows</th><th className="p-2">Created / Updated</th><th className="p-2" />
              </tr>
            </thead>
            <tbody>
              {imports.data?.map((b: any) => (
                <tr key={b.id} className="border-b">
                  <td className="p-2">
                    <button className="text-left font-medium underline-offset-2 hover:underline" onClick={() => setActiveImport(b.id)}>
                      {b.file_name}
                    </button>
                    <div className="text-xs text-muted-foreground">
                      {b.file_checksum ? `${b.file_checksum.slice(0, 10)}…` : "—"} · {b.parser_version ?? "—"}
                      {b.is_test && <Badge className="ml-2 bg-amber-100 text-amber-900">test</Badge>}
                    </div>
                  </td>
                  <td className="p-2">{b.supplier ?? "—"}</td>
                  <td className="p-2 text-xs">{new Date(b.created_at).toLocaleString("en-ZA")}</td>
                  <td className="p-2"><Badge variant="outline">{b.status}</Badge></td>
                  <td className="p-2">{b.rows_examined ?? b.total_rows}</td>
                  <td className="p-2">{b.created_count} / {b.updated_count}</td>
                  <td className="p-2 text-right">
                    {b.status === "completed" && (
                      <Button size="sm" variant="outline" disabled={!isAdmin || !!busy}
                        onClick={() => run("Rolling back…", () => rollback({ data: { import_id: b.id } }), "Import rolled back.")}>
                        <RotateCcw className="mr-1 h-4 w-4" />Roll back
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border bg-background p-2">
      <div className="text-lg font-semibold">{value}</div>
      <div className="text-xs capitalize text-muted-foreground">{label}</div>
    </div>
  );
}
