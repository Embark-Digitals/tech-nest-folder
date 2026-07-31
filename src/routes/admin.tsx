import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth, useRoles } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { formatDate, formatZAR, ORDER_STATUS_LABELS, STOCK_LABELS } from "@/lib/format";
import { slugify, parseCatalogueRows, type ParsedRow } from "@/lib/import-utils";
import { CrmPanel } from "@/components/admin/CrmPanel";
import { TeamPanel } from "@/components/admin/TeamPanel";
import { ReportsPanel } from "@/components/admin/ReportsPanel";
import { SupplierImportPanel } from "@/components/admin/SupplierImportPanel";
import { EmailLogPanel } from "@/components/admin/EmailLogPanel";
import { useServerFn } from "@tanstack/react-start";
import { notifyOrderEvent } from "@/lib/email.functions";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Staff Admin | TechNest" },
      { name: "description", content: "TechNest staff console for pricing, catalogue imports and order management." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Staff Admin | TechNest" },
      { property: "og:description", content: "TechNest staff console." },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const { user, loading } = useAuth();
  const { isStaff, isAdmin } = useRoles(user?.id);

  if (loading) return <Skeleton className="mx-auto my-16 h-64 max-w-5xl" />;

  if (!user) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 text-center">
        <h1 className="font-display text-3xl font-bold">Staff sign-in required</h1>
        <Button asChild className="mt-6">
          <Link to="/auth">Sign in</Link>
        </Button>
      </div>
    );
  }

  if (!isStaff) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 text-center">
        <h1 className="font-display text-3xl font-bold">Staff access only</h1>
        <p className="mt-2 text-muted-foreground">
          Your account doesn't have staff permissions for the TechNest console.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <h1 className="font-display text-3xl font-bold">Staff console</h1>
      <Tabs defaultValue="orders" className="mt-6">
        <TabsList className="flex-wrap">
          <TabsTrigger value="orders">Orders</TabsTrigger>
          <TabsTrigger value="crm">CRM</TabsTrigger>
          <TabsTrigger value="catalogue">Catalogue</TabsTrigger>
          <TabsTrigger value="import">Import</TabsTrigger>
          <TabsTrigger value="shipping">Shipping</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
          <TabsTrigger value="emails">Emails</TabsTrigger>
          {isAdmin && <TabsTrigger value="pricing">Pricing</TabsTrigger>}
          {isAdmin && <TabsTrigger value="team">Team</TabsTrigger>}
        </TabsList>
        <TabsContent value="orders" className="pt-6">
          <OrdersPanel isAdmin={isAdmin} />
        </TabsContent>
        <TabsContent value="crm" className="pt-6">
          <CrmPanel currentUserId={user.id} />
        </TabsContent>
        <TabsContent value="catalogue" className="pt-6">
          <CataloguePanel />
        </TabsContent>
        <TabsContent value="import" className="pt-6">
          <SupplierImportPanel isAdmin={isAdmin} />
        </TabsContent>
        <TabsContent value="emails" className="pt-6">
          <EmailLogPanel isAdmin={isAdmin} />
        </TabsContent>
        <TabsContent value="reports" className="pt-6">
          <ReportsPanel />
        </TabsContent>
        {isAdmin && (
          <TabsContent value="pricing" className="pt-6">
            <PricingPanel userId={user.id} />
          </TabsContent>
        )}
        {isAdmin && (
          <TabsContent value="team" className="pt-6">
            <TeamPanel currentUserId={user.id} />
          </TabsContent>
        )}
      </Tabs>

    </div>
  );
}

function OrdersPanel({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const [eftOrder, setEftOrder] = useState<{ id: string; number: string; total: number } | null>(null);
  const [eftRef, setEftRef] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["admin-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, order_number, contact_name, contact_email, status, total_incl_vat, created_at, payment_status, payment_method, payment_source, payment_reference",
        )
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });

  const notify = useServerFn(notifyOrderEvent);

  const STATUS_EMAIL: Record<string, string> = {
    stock_confirmed: "order_status_stock_confirmed",
    awaiting_payment: "order_eft_instructions",
    paid: "order_payment_received",
    processing: "order_status_processing",
    ready_for_dispatch: "order_status_ready_for_dispatch",
    shipped: "order_dispatched",
    delivered: "order_delivered",
    cancelled: "order_cancelled",
    refunded: "order_refunded",
  };

  const setStatus = async (id: string, status: string) => {
    const { error } = await supabase.rpc("set_order_status", {
      _order_id: id,
      _status: status as never,
      _note: "Updated from admin console",
    });
    if (error) return toast.error(error.message);
    toast.success("Order updated");
    qc.invalidateQueries({ queryKey: ["admin-orders"] });
    // Notification is best-effort — a failure is logged in the Emails tab.
    void notify({ data: { order_id: id, event: (STATUS_EMAIL[status] ?? "order_status_update") as never } });
  };

  const confirmEft = async () => {
    if (!eftOrder) return;
    const { error } = await supabase.rpc("confirm_manual_eft", {
      _order_id: eftOrder.id,
      _payment_reference: eftRef,
      _amount_incl_vat: eftOrder.total,
    });
    if (error) return toast.error(error.message);
    toast.success("Manual EFT recorded");
    void notify({ data: { order_id: eftOrder.id, event: "order_payment_received" } });
    setEftOrder(null);
    setEftRef("");
    qc.invalidateQueries({ queryKey: ["admin-orders"] });
  };

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <Card className="p-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Order</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Total</TableHead>
            <TableHead>Payment</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(data ?? []).map((o) => (
            <TableRow key={o.id}>
              <TableCell className="font-medium">{o.order_number}</TableCell>
              <TableCell>
                {o.contact_name}
                <span className="block text-xs text-muted-foreground">{o.contact_email}</span>
              </TableCell>
              <TableCell>{formatDate(o.created_at)}</TableCell>
              <TableCell>{formatZAR(Number(o.total_incl_vat))}</TableCell>
              <TableCell className="text-xs">
                <span className="font-medium uppercase">{o.payment_status}</span>
                <span className="block text-muted-foreground">
                  {o.payment_method}
                  {o.payment_reference ? ` · ${o.payment_reference}` : ""}
                </span>
                {isAdmin && o.payment_status !== "paid" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-1"
                    onClick={() =>
                      setEftOrder({ id: o.id, number: o.order_number, total: Number(o.total_incl_vat) })
                    }
                  >
                    Confirm EFT
                  </Button>
                )}
              </TableCell>
              <TableCell>
                <Select value={o.status} onValueChange={(v) => setStatus(o.id, v)}>
                  <SelectTrigger className="w-56">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(ORDER_STATUS_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableCell>
            </TableRow>
          ))}
          {(data ?? []).length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                No orders yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <Dialog open={!!eftOrder} onOpenChange={(open: boolean) => !open && setEftOrder(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm manual EFT</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {eftOrder?.number} · {eftOrder ? formatZAR(eftOrder.total) : ""}
          </p>
          <Input
            placeholder="Bank payment reference"
            value={eftRef}
            onChange={(e) => setEftRef(e.target.value)}
            maxLength={60}
          />
          <Button onClick={confirmEft} disabled={eftRef.trim().length < 3}>
            Record payment received
          </Button>
        </DialogContent>
      </Dialog>
    </Card>
  );
}


type CatalogueFilter =
  | "all"
  | "published"
  | "draft"
  | "missing_price"
  | "review"
  | "override"
  | "missing_image";

const CATALOGUE_FILTERS: { value: CatalogueFilter; label: string }[] = [
  { value: "all", label: "All products" },
  { value: "published", label: "Published" },
  { value: "draft", label: "Drafts" },
  { value: "missing_price", label: "Missing price" },
  { value: "review", label: "Pricing review required" },
  { value: "override", label: "Manual override" },
  { value: "missing_image", label: "Image required" },
];

function CataloguePanel() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<CatalogueFilter>("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select(
          "id, sku, name, stock_status, promotional_price_ex_vat, selling_price_incl_vat, manual_price_override, is_published, pricing_review_required, product_images(id)",
        )
        .order("name")
        .limit(500);
      if (error) throw error;
      return data;
    },
  });

  const products = (data ?? []).filter((p) => {
    const q = search.trim().toLowerCase();
    if (q && !`${p.sku} ${p.name}`.toLowerCase().includes(q)) return false;
    switch (filter) {
      case "published":
        return p.is_published;
      case "draft":
        return !p.is_published;
      case "missing_price":
        return !p.promotional_price_ex_vat || !p.selling_price_incl_vat;
      case "review":
        return p.pricing_review_required;
      case "override":
        return p.manual_price_override !== null;
      case "missing_image":
        return (p.product_images ?? []).length === 0;
      default:
        return true;
    }
  });

  const allSelected = products.length > 0 && products.every((p) => selected.includes(p.id));

  const toggleSelect = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const toggleSelectAll = () =>
    setSelected(allSelected ? [] : products.map((p) => p.id));

  const togglePublish = async (id: string, next: boolean) => {
    const { error } = await supabase.from("products").update({ is_published: next }).eq("id", id);
    if (error) return toast.error("Could not update product");
    qc.invalidateQueries({ queryKey: ["admin-products"] });
  };

  const bulkPublish = async (next: boolean) => {
    if (!selected.length) return;
    setBusy(true);
    const { error } = await supabase.from("products").update({ is_published: next }).in("id", selected);
    setBusy(false);
    if (error) return toast.error("Bulk update failed");
    toast.success(`${selected.length} product(s) ${next ? "published" : "unpublished"}`);
    setSelected([]);
    qc.invalidateQueries({ queryKey: ["admin-products"] });
  };

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-56 flex-1">
          <Label htmlFor="cat-search">Search SKU or name</Label>
          <Input
            id="cat-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="e.g. MacBook or SKU123"
            className="mt-1"
          />
        </div>
        <div className="w-60">
          <Label htmlFor="cat-filter">Filter</Label>
          <Select value={filter} onValueChange={(v) => setFilter(v as CatalogueFilter)}>
            <SelectTrigger id="cat-filter" className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATALOGUE_FILTERS.map((f) => (
                <SelectItem key={f.value} value={f.value}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <Button size="sm" disabled={!selected.length || busy} onClick={() => bulkPublish(true)}>
            Publish selected
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!selected.length || busy}
            onClick={() => bulkPublish(false)}
          >
            Unpublish selected
          </Button>
        </div>
        <p className="w-full text-xs text-muted-foreground">
          {products.length} shown · {selected.length} selected
        </p>
      </Card>

      <Card className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <input
                  type="checkbox"
                  aria-label="Select all products"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                />
              </TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Cost excl. VAT</TableHead>
              <TableHead>Selling incl. VAT</TableHead>
              <TableHead>Stock</TableHead>
              <TableHead>Published</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  <input
                    type="checkbox"
                    aria-label={`Select ${p.sku}`}
                    checked={selected.includes(p.id)}
                    onChange={() => toggleSelect(p.id)}
                  />
                </TableCell>
                <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                <TableCell>
                  {p.name}
                  {p.pricing_review_required && (
                    <Badge className="ml-2 border-0 bg-warning text-warning-foreground">Review pricing</Badge>
                  )}
                  {(p.product_images ?? []).length === 0 && (
                    <Badge variant="outline" className="ml-2">Image required</Badge>
                  )}
                  {p.manual_price_override !== null && (
                    <Badge variant="secondary" className="ml-2">Override</Badge>
                  )}
                </TableCell>
                <TableCell>{formatZAR(Number(p.promotional_price_ex_vat ?? 0))}</TableCell>
                <TableCell className="font-medium">{formatZAR(p.selling_price_incl_vat)}</TableCell>
                <TableCell>{STOCK_LABELS[p.stock_status] ?? p.stock_status}</TableCell>
                <TableCell>
                  <Button size="sm" variant={p.is_published ? "secondary" : "outline"} onClick={() => togglePublish(p.id, !p.is_published)}>
                    {p.is_published ? "Published" : "Draft"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {products.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  No products match this filter.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}


function ImportPanel({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);

  const imports = useQuery({
    queryKey: ["catalogue-imports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("catalogue_imports")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data;
    },
  });

  const onFile = async (file: File) => {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
    setFileName(file.name);
    setRows(parseCatalogueRows(json));
  };

  const commit = async () => {
    setBusy(true);
    const valid = rows.filter((r) => r.valid);
    const invalid = rows.filter((r) => !r.valid);

    const { data: importRow } = await supabase
      .from("catalogue_imports")
      .insert({
        file_name: fileName,
        imported_by: userId,
        status: "previewing",
        total_rows: rows.length,
      })
      .select("id")
      .single();

    let created = 0;
    let updated = 0;

    for (const row of valid) {
      const { data: existing } = await supabase.from("products").select("id").eq("sku", row.sku).maybeSingle();
      const payload = {
        sku: row.sku,
        name: row.name,
        slug: slugify(row.name || row.sku),
        short_description: row.description || null,
        promotional_price_ex_vat: row.promotionalPrice,
        dealer_price_ex_vat: row.dealerPrice,
        supplier_availability: row.availability as never,
        stock_status: row.stockStatus as never,
        quantity: row.quantity,
      };
      if (existing) {
        const { error } = await supabase.from("products").update(payload).eq("id", existing.id);
        if (!error) updated += 1;
      } else {
        const { error } = await supabase.from("products").insert(payload);
        if (!error) created += 1;
      }
    }

    if (importRow) {
      await supabase
        .from("catalogue_imports")
        .update({
          status: "completed",
          created_count: created,
          updated_count: updated,
          error_count: invalid.length,
          skipped_count: invalid.length,
        })
        .eq("id", importRow.id);

      if (invalid.length) {
        await supabase.from("catalogue_import_errors").insert(
          invalid.map((r) => ({
            import_id: importRow.id,
            row_number: r.rowNumber,
            product_code: r.sku || null,
            error_type: "validation",
            message: r.error ?? "Invalid row",
          })),
        );
      }
    }

    setBusy(false);
    setRows([]);
    toast.success(`Import complete — ${created} created, ${updated} updated, ${invalid.length} skipped`);
    qc.invalidateQueries({ queryKey: ["catalogue-imports"] });
    qc.invalidateQueries({ queryKey: ["admin-products"] });
  };

  return (
    <div className="space-y-6">
      <Card className="space-y-4 p-6">
        <h2 className="font-display text-lg font-semibold">Import supplier catalogue (.xlsx / .csv)</h2>
        <p className="text-sm text-muted-foreground">
          Expected columns: Product Code, Description, Promotional Price, Dealer Price, Availability, Quantity.
          Selling prices are calculated automatically using your markup and VAT settings.
        </p>
        <Input
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
        />
        {rows.length > 0 && (
          <div>
            <p className="text-sm">
              {rows.filter((r) => r.valid).length} valid rows · {rows.filter((r) => !r.valid).length} with errors
            </p>
            <div className="mt-3 max-h-80 overflow-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Row</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Promo price</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.slice(0, 100).map((r) => (
                    <TableRow key={r.rowNumber}>
                      <TableCell>{r.rowNumber}</TableCell>
                      <TableCell className="font-mono text-xs">{r.sku}</TableCell>
                      <TableCell className="max-w-xs truncate">{r.name}</TableCell>
                      <TableCell>{r.promotionalPrice ? formatZAR(r.promotionalPrice) : "—"}</TableCell>
                      <TableCell>
                        {r.valid ? (
                          <Badge className="border-0 bg-success text-success-foreground">Ready</Badge>
                        ) : (
                          <Badge className="border-0 bg-destructive text-destructive-foreground">{r.error}</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Button className="mt-4" onClick={commit} disabled={busy}>
              {busy ? "Importing…" : "Commit import"}
            </Button>
          </div>
        )}
      </Card>

      <Card className="p-6">
        <h2 className="font-display text-lg font-semibold">Recent imports</h2>
        <div className="mt-4 space-y-2 text-sm">
          {(imports.data ?? []).map((i) => (
            <div key={i.id} className="flex flex-wrap justify-between gap-2 border-b py-2 last:border-0">
              <span className="font-medium">{i.file_name}</span>
              <span className="text-muted-foreground">
                {i.created_count} created · {i.updated_count} updated · {i.error_count} errors ·{" "}
                {formatDate(i.created_at)}
              </span>
            </div>
          ))}
          {(imports.data ?? []).length === 0 && <p className="text-muted-foreground">No imports yet.</p>}
        </div>
      </Card>
    </div>
  );
}

function PricingPanel({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["pricing-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("pricing_settings").select("*").limit(1).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [busy, setBusy] = useState(false);

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  const save = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const markup = Number(form.get("markup")) / 100;
    const vat = Number(form.get("vat")) / 100;
    const rounding = String(form.get("rounding"));
    if (!Number.isFinite(markup) || markup < 0 || markup > 5) return toast.error("Markup must be 0–500%");
    if (!Number.isFinite(vat) || vat < 0 || vat > 1) return toast.error("VAT must be 0–100%");

    setBusy(true);
    const { error } = await supabase
      .from("pricing_settings")
      .update({ markup_rate: markup, vat_rate: vat, rounding: rounding as never, updated_by: userId })
      .eq("id", data!.id);
    setBusy(false);
    if (error) return toast.error("Could not save pricing settings");
    toast.success("Pricing settings saved");
    qc.invalidateQueries({ queryKey: ["pricing-settings"] });
  };

  const recalcAll = async () => {
    setBusy(true);
    const { data: products } = await supabase.from("products").select("id, markup_rate");
    for (const p of products ?? []) {
      await supabase.from("products").update({ markup_rate: data!.markup_rate }).eq("id", p.id);
    }
    setBusy(false);
    toast.success("All product prices recalculated");
    qc.invalidateQueries({ queryKey: ["admin-products"] });
  };

  return (
    <Card className="max-w-xl p-6">
      <h2 className="font-display text-lg font-semibold">Pricing engine</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Selling price = supplier promotional price + markup, then VAT is added and rounding applied.
      </p>
      <form onSubmit={save} className="mt-6 space-y-4">
        <div>
          <Label htmlFor="markup">Markup %</Label>
          <Input
            id="markup"
            name="markup"
            type="number"
            step="0.1"
            defaultValue={((data?.markup_rate ?? 0.2) * 100).toFixed(1)}
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="vat">VAT %</Label>
          <Input
            id="vat"
            name="vat"
            type="number"
            step="0.1"
            defaultValue={((data?.vat_rate ?? 0.15) * 100).toFixed(1)}
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="rounding">Rounding</Label>
          <Select name="rounding" defaultValue={data?.rounding ?? "exact"}>
            <SelectTrigger id="rounding" className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="exact">Exact (cents)</SelectItem>
              <SelectItem value="nearest_rand">Nearest Rand</SelectItem>
              <SelectItem value="nearest_ten">Nearest R10</SelectItem>
              <SelectItem value="ends_99">Ends in .99</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <Button type="submit" disabled={busy}>
            Save settings
          </Button>
          <Button type="button" variant="outline" onClick={recalcAll} disabled={busy}>
            Recalculate all prices
          </Button>
        </div>
      </form>
    </Card>
  );
}
