import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { formatZAR } from "@/lib/format";
import {
  DELIVERY_CLASS_LABELS,
  deliveryClassRulesQuery,
  postalRulesQuery,
  provincesQuery,
  shippingSettingsQuery,
  shippingZonesQuery,
  type DeliveryClass,
} from "@/lib/shipping";

const ACTIONS = ["include", "exclude", "override", "remote"] as const;

export function ShippingPanel({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const { data: provinces } = useQuery(provincesQuery);
  const { data: zones } = useQuery(shippingZonesQuery);
  const { data: rules } = useQuery(postalRulesQuery);
  const { data: classRules } = useQuery(deliveryClassRulesQuery);
  const { data: settings } = useQuery(shippingSettingsQuery);
  const [productSearch, setProductSearch] = useState("");
  const [newRule, setNewRule] = useState({ zone_id: "", from: "", to: "", action: "include", fee: "", note: "" });

  const { data: products } = useQuery({
    queryKey: ["shipping-products", productSearch],
    queryFn: async () => {
      let q = supabase
        .from("products")
        .select("id, sku, name, delivery_class, delivery_restricted")
        .order("name")
        .limit(40);
      if (productSearch.trim()) q = q.ilike("name", `%${productSearch.trim()}%`);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const refresh = (...keys: string[]) =>
    keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));

  const guard = () => {
    if (!isAdmin) {
      toast.error("Only administrators may change shipping configuration.");
      return false;
    }
    return true;
  };

  const saveProvince = async (id: string, is_active: boolean) => {
    if (!guard()) return;
    const { error } = await supabase.from("shipping_provinces").update({ is_active }).eq("id", id);
    if (error) return toast.error(error.message);
    refresh("shipping-provinces");
    toast.success("Province updated");
  };

  const saveZone = async (id: string, patch: Record<string, unknown>) => {
    if (!guard()) return;
    const { error } = await supabase.from("shipping_zones").update(patch as never).eq("id", id);
    if (error) return toast.error(error.message);
    refresh("shipping-zones");
    toast.success("Zone updated");
  };

  const addRule = async () => {
    if (!guard()) return;
    const from = Number(newRule.from);
    const to = Number(newRule.to || newRule.from);
    if (!newRule.zone_id || !Number.isFinite(from) || !Number.isFinite(to)) {
      return toast.error("Choose a zone and a valid postal code range.");
    }
    const zone = zones?.find((z) => z.id === newRule.zone_id);
    const { error } = await supabase.from("shipping_postal_rules").insert({
      zone_id: newRule.zone_id,
      province_code: zone?.province_code ?? null,
      code_from: from,
      code_to: to,
      action: newRule.action as (typeof ACTIONS)[number],
      override_fee: newRule.action === "override" && newRule.fee ? Number(newRule.fee) : null,
      note: newRule.note || null,
      priority: newRule.action === "include" ? 0 : 10,
    });
    if (error) return toast.error(error.message);
    setNewRule({ zone_id: "", from: "", to: "", action: "include", fee: "", note: "" });
    refresh("shipping-postal-rules");
    toast.success("Postal rule added");
  };

  const deleteRule = async (id: string) => {
    if (!guard()) return;
    const { error } = await supabase.from("shipping_postal_rules").delete().eq("id", id);
    if (error) return toast.error(error.message);
    refresh("shipping-postal-rules");
  };

  const saveClassRule = async (id: string, patch: Record<string, unknown>) => {
    if (!guard()) return;
    const { error } = await supabase.from("delivery_class_rules").update(patch as never).eq("id", id);
    if (error) return toast.error(error.message);
    refresh("delivery-class-rules");
    toast.success("Delivery class updated");
  };

  const saveSettings = async (patch: Record<string, unknown>) => {
    if (!guard() || !settings) return;
    const { error } = await supabase.from("shipping_settings").update(patch as never).eq("id", settings.id);
    if (error) return toast.error(error.message);
    refresh("shipping-settings");
    toast.success("Shipping settings saved");
  };

  const saveProductClass = async (id: string, patch: Record<string, unknown>) => {
    if (!guard()) return;
    const { error } = await supabase.from("products").update(patch as never).eq("id", id);
    if (error) return toast.error(error.message);
    refresh("shipping-products");
    toast.success("Product delivery class updated");
  };

  return (
    <div className="space-y-8">
      {!isAdmin && (
        <p className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          Shipping configuration is read-only for your role.
        </p>
      )}

      <Card className="p-6">
        <h2 className="font-display text-lg font-semibold">Provinces</h2>
        <p className="text-sm text-muted-foreground">
          Only active provinces receive an automatic delivery rate. Inactive provinces are future
          configuration and cannot be checked out as standard delivery.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(provinces ?? []).map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="font-medium">{p.name}</p>
                <p className="text-xs text-muted-foreground">{p.code}</p>
              </div>
              <Switch
                checked={p.is_active}
                disabled={!isAdmin}
                onCheckedChange={(v) => saveProvince(p.id, v)}
              />
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="font-display text-lg font-semibold">Delivery zones</h2>
        <div className="mt-4 space-y-4">
          {(zones ?? []).map((z) => (
            <div key={z.id} className="rounded-lg border p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{z.name}</span>
                  <Badge variant="outline">{z.province_code}</Badge>
                  {z.is_suspended && <Badge variant="destructive">Suspended</Badge>}
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <label className="flex items-center gap-2">
                    Active
                    <Switch
                      checked={z.is_active}
                      disabled={!isAdmin}
                      onCheckedChange={(v) => saveZone(z.id, { is_active: v })}
                    />
                  </label>
                  <label className="flex items-center gap-2">
                    Suspend
                    <Switch
                      checked={z.is_suspended}
                      disabled={!isAdmin}
                      onCheckedChange={(v) => saveZone(z.id, { is_suspended: v })}
                    />
                  </label>
                  <label className="flex items-center gap-2">
                    Collection
                    <Switch
                      checked={z.collection_enabled}
                      disabled={!isAdmin}
                      onCheckedChange={(v) => saveZone(z.id, { collection_enabled: v })}
                    />
                  </label>
                </div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {[
                  ["base_fee", "Base rate (R)", z.base_fee],
                  ["free_delivery_threshold", "Free over (R)", z.free_delivery_threshold ?? ""],
                  ["remote_surcharge", "Remote surcharge (R)", z.remote_surcharge],
                  ["estimate_min_days", "Min days", z.estimate_min_days],
                  ["estimate_max_days", "Max days", z.estimate_max_days],
                ].map(([key, label, value]) => (
                  <div key={String(key)}>
                    <Label className="text-xs">{label as string}</Label>
                    <Input
                      className="mt-1"
                      type="number"
                      defaultValue={String(value ?? "")}
                      disabled={!isAdmin}
                      onBlur={(e) => {
                        const raw = e.target.value;
                        const next = raw === "" ? null : Number(raw);
                        saveZone(z.id, { [String(key)]: next });
                      }}
                    />
                  </div>
                ))}
                <div>
                  <Label className="text-xs">Suspension note</Label>
                  <Input
                    className="mt-1"
                    defaultValue={z.suspension_note ?? ""}
                    disabled={!isAdmin}
                    onBlur={(e) => saveZone(z.id, { suspension_note: e.target.value || null })}
                  />
                </div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Delivery classes accepted: {(z.allowed_delivery_classes ?? []).join(", ")}
              </p>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="font-display text-lg font-semibold">Postal code rules</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Select value={newRule.zone_id} onValueChange={(v) => setNewRule({ ...newRule, zone_id: v })}>
            <SelectTrigger><SelectValue placeholder="Zone" /></SelectTrigger>
            <SelectContent>
              {(zones ?? []).map((z) => (
                <SelectItem key={z.id} value={z.id}>{z.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder="From"
            value={newRule.from}
            onChange={(e) => setNewRule({ ...newRule, from: e.target.value })}
          />
          <Input
            placeholder="To"
            value={newRule.to}
            onChange={(e) => setNewRule({ ...newRule, to: e.target.value })}
          />
          <Select value={newRule.action} onValueChange={(v) => setNewRule({ ...newRule, action: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {ACTIONS.map((a) => (
                <SelectItem key={a} value={a}>{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder="Override fee"
            value={newRule.fee}
            onChange={(e) => setNewRule({ ...newRule, fee: e.target.value })}
          />
          <Input
            placeholder="Note"
            value={newRule.note}
            onChange={(e) => setNewRule({ ...newRule, note: e.target.value })}
          />
        </div>
        <Button className="mt-3" onClick={addRule} disabled={!isAdmin}>
          Add rule
        </Button>
        <Separator className="my-4" />
        <div className="max-h-96 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Range</TableHead>
                <TableHead>Zone</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Override</TableHead>
                <TableHead>Note</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(rules ?? []).map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">
                    {String(r.code_from).padStart(4, "0")}–{String(r.code_to).padStart(4, "0")}
                  </TableCell>
                  <TableCell>{zones?.find((z) => z.id === r.zone_id)?.name ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={r.action === "exclude" ? "destructive" : "secondary"}>{r.action}</Badge>
                  </TableCell>
                  <TableCell>{r.override_fee ? formatZAR(Number(r.override_fee)) : "—"}</TableCell>
                  <TableCell className="max-w-[240px] truncate text-xs text-muted-foreground">
                    {r.note}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" disabled={!isAdmin} onClick={() => deleteRule(r.id)}>
                      Remove
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="font-display text-lg font-semibold">Delivery classes and surcharges</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(classRules ?? []).map((c) => (
            <div key={c.id} className="rounded-lg border p-3">
              <p className="font-medium">{c.label}</p>
              <p className="text-xs text-muted-foreground">{c.delivery_class}</p>
              <Label className="mt-2 block text-xs">Surcharge (R)</Label>
              <Input
                type="number"
                className="mt-1"
                defaultValue={String(c.surcharge)}
                disabled={!isAdmin}
                onBlur={(e) => saveClassRule(c.id, { surcharge: Number(e.target.value || 0) })}
              />
              <div className="mt-2 flex items-center justify-between text-xs">
                <span>Manual quote</span>
                <Switch
                  checked={c.requires_manual_quote}
                  disabled={!isAdmin}
                  onCheckedChange={(v) => saveClassRule(c.id, { requires_manual_quote: v })}
                />
              </div>
              <div className="mt-2 flex items-center justify-between text-xs">
                <span>Collection only</span>
                <Switch
                  checked={c.collection_only}
                  disabled={!isAdmin}
                  onCheckedChange={(v) => saveClassRule(c.id, { collection_only: v })}
                />
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="font-display text-lg font-semibold">Product delivery classes</h2>
        <Input
          className="mt-3 max-w-sm"
          placeholder="Search products…"
          value={productSearch}
          onChange={(e) => setProductSearch(e.target.value)}
        />
        <div className="mt-4 max-h-96 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Class</TableHead>
                <TableHead>Manual quote only</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(products ?? []).map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <span className="block text-sm">{p.name}</span>
                    <span className="text-xs text-muted-foreground">{p.sku}</span>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={p.delivery_class}
                      disabled={!isAdmin}
                      onValueChange={(v) => saveProductClass(p.id, { delivery_class: v })}
                    >
                      <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(Object.keys(DELIVERY_CLASS_LABELS) as DeliveryClass[]).map((k) => (
                          <SelectItem key={k} value={k}>{DELIVERY_CLASS_LABELS[k]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={p.delivery_restricted}
                      disabled={!isAdmin}
                      onCheckedChange={(v) => saveProductClass(p.id, { delivery_restricted: v })}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="font-display text-lg font-semibold">Collection and messaging</h2>
        {settings && (
          <div className="mt-4 space-y-4">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <span className="text-sm font-medium">Collection enabled</span>
              <Switch
                checked={settings.collection_enabled}
                disabled={!isAdmin}
                onCheckedChange={(v) => saveSettings({ collection_enabled: v })}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <span className="text-sm font-medium">Manual delivery quotes enabled</span>
              <Switch
                checked={settings.manual_quote_enabled}
                disabled={!isAdmin}
                onCheckedChange={(v) => saveSettings({ manual_quote_enabled: v })}
              />
            </div>
            <div>
              <Label className="text-xs">Collection address</Label>
              <Input
                className="mt-1"
                defaultValue={settings.collection_address}
                disabled={!isAdmin}
                onBlur={(e) => saveSettings({ collection_address: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">Collection instructions</Label>
              <Textarea
                className="mt-1"
                defaultValue={settings.collection_instructions}
                disabled={!isAdmin}
                onBlur={(e) => saveSettings({ collection_instructions: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">Unsupported area message</Label>
              <Textarea
                className="mt-1"
                defaultValue={settings.unsupported_area_message}
                disabled={!isAdmin}
                onBlur={(e) => saveSettings({ unsupported_area_message: e.target.value })}
              />
            </div>
          </div>
        )}
      </Card>

      <EnquiriesCard />
    </div>
  );
}

function EnquiriesCard() {
  const { data } = useQuery({
    queryKey: ["delivery-enquiries"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("delivery_enquiries")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  return (
    <Card className="p-6">
      <h2 className="font-display text-lg font-semibold">Out-of-area delivery enquiries</h2>
      <p className="text-sm text-muted-foreground">
        These are enquiries only — they are stored separately and are not confirmed orders.
      </p>
      <div className="mt-4 max-h-80 overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Area</TableHead>
              <TableHead>Estimated items</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-sm text-muted-foreground">
                  No enquiries yet.
                </TableCell>
              </TableRow>
            )}
            {(data ?? []).map((e) => (
              <TableRow key={e.id}>
                <TableCell>
                  <span className="block text-sm">{e.contact_name}</span>
                  <span className="text-xs text-muted-foreground">{e.contact_email}</span>
                </TableCell>
                <TableCell className="text-sm">
                  {e.city ? `${e.city}, ` : ""}
                  {e.province} {e.postal_code}
                </TableCell>
                <TableCell className="text-sm">
                  {e.estimated_subtotal_incl_vat
                    ? formatZAR(Number(e.estimated_subtotal_incl_vat))
                    : "—"}
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{e.status}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
