import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, CircleDashed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { formatDate } from "@/lib/format";

type Settings = Record<string, unknown> & { id: string };

const FIELDS: { key: string; label: string; multiline?: boolean; optional?: boolean }[] = [
  { key: "registered_business_name", label: "Registered business name" },
  { key: "trading_name", label: "Trading name" },
  { key: "legal_status", label: "Legal status (e.g. private company, sole proprietor)" },
  { key: "company_registration_number", label: "Company registration number", optional: true },
  { key: "place_of_registration", label: "Place of registration", optional: true },
  { key: "physical_address", label: "Physical business address", multiline: true },
  { key: "legal_service_address", label: "Address for service of legal documents", multiline: true },
  { key: "telephone_number", label: "Telephone number" },
  { key: "whatsapp_number", label: "WhatsApp number", optional: true },
  { key: "support_email", label: "Support email" },
  { key: "order_email", label: "Order email" },
  { key: "website_url", label: "Website address" },
  { key: "office_bearers", label: "Office bearers / directors", multiline: true, optional: true },
  { key: "collection_hours", label: "Collection operating hours", optional: true },
];

const PLACEHOLDER = /(\+?27\s*0{2}\s*0{3}\s*0{4})|0{5,}|123 business|example\.com|placeholder|tbc|n\/a/i;

const isSupplied = (v: unknown) => {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length > 2 && !PLACEHOLDER.test(s);
};

/** ECTA s43 disclosure checklist, mapped to the page each item appears on. */
const LEGAL_CHECKS: { label: string; page: string; source: "settings" | "content"; keys?: string[] }[] = [
  { label: "Full supplier name and legal status", page: "/about, /terms", source: "settings", keys: ["registered_business_name", "legal_status"] },
  { label: "Physical address", page: "/contact, /terms", source: "settings", keys: ["physical_address"] },
  { label: "Telephone number", page: "/contact", source: "settings", keys: ["telephone_number"] },
  { label: "Website and email address", page: "/contact", source: "settings", keys: ["website_url", "support_email"] },
  { label: "Registration number where applicable", page: "/terms", source: "settings", keys: ["company_registration_number"] },
  { label: "Office bearers and place of registration", page: "/terms", source: "settings", keys: ["office_bearers", "place_of_registration"] },
  { label: "Address for service of legal documents", page: "/terms", source: "settings", keys: ["legal_service_address"] },
  { label: "Product description", page: "/product/*", source: "content" },
  { label: "Full price including delivery, VAT and fees", page: "/product/*, /checkout", source: "content" },
  { label: "Payment methods accepted", page: "/terms, /checkout", source: "content" },
  { label: "Terms of agreement and guarantees", page: "/terms", source: "content" },
  { label: "Delivery periods", page: "/delivery", source: "content" },
  { label: "Access to transaction records", page: "/account, /terms", source: "content" },
  { label: "Returns, exchanges and refunds", page: "/returns", source: "content" },
  { label: "Privacy and security policy", page: "/privacy", source: "content" },
  { label: "Cancellation rights (CPA s44 cooling-off)", page: "/returns, /terms", source: "content" },
];

export function BusinessInfoPanel({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const { data: settings, isLoading } = useQuery({
    queryKey: ["admin", "site-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("site_settings").select("*").limit(1).maybeSingle();
      if (error) throw error;
      return data as Settings | null;
    },
  });

  const { data: shipping } = useQuery({
    queryKey: ["admin", "shipping-settings-business"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shipping_settings")
        .select("id, collection_enabled, collection_address, collection_instructions")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (!settings) return;
    const next: Record<string, string> = {};
    for (const f of FIELDS) next[f.key] = (settings[f.key] as string | null) ?? "";
    setDraft(next);
  }, [settings]);

  const missing = useMemo(
    () => FIELDS.filter((f) => !isSupplied(draft[f.key] ?? settings?.[f.key])),
    [draft, settings],
  );
  const supplied = FIELDS.length - missing.length;

  const legalRows = useMemo(
    () =>
      LEGAL_CHECKS.map((c) => {
        const ok =
          c.source === "content"
            ? true
            : (c.keys ?? []).every((k) => isSupplied(draft[k] ?? settings?.[k]));
        return { ...c, ok };
      }),
    [draft, settings],
  );
  const legalMissing = legalRows.filter((r) => !r.ok).length;

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    const payload: Record<string, string | null> = {};
    for (const f of FIELDS) payload[f.key] = (draft[f.key] ?? "").trim() || null;
    // Keep the legacy customer-facing fields in step with the new ones.
    payload["store_phone"] = payload["telephone_number"] ?? "";
    payload["whatsapp_number"] = payload["whatsapp_number"] ?? "";
    payload["store_email"] = payload["support_email"] ?? (settings["store_email"] as string);
    const { error } = await supabase
      .from("site_settings")
      .update(payload as never)
      .eq("id", settings.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Business information saved");
    void qc.invalidateQueries({ queryKey: ["admin", "site-settings"] });
    void qc.invalidateQueries({ queryKey: ["site-settings"] });
  };

  const markReviewed = async (status: "incomplete" | "in_review") => {
    if (!settings) return;
    const { error } = await supabase
      .from("site_settings")
      .update({ legal_review_status: status, legal_last_reviewed_at: new Date().toISOString() })
      .eq("id", settings.id);
    if (error) return toast.error(error.message);
    toast.success("Legal review status updated");
    void qc.invalidateQueries({ queryKey: ["admin", "site-settings"] });
  };

  if (isLoading) return <Skeleton className="h-96 w-full" />;
  if (!isAdmin)
    return <p className="text-sm text-muted-foreground">Only administrators can edit business information.</p>;

  const collectionBlocked = !isSupplied(shipping?.collection_address) ;

  return (
    <div className="space-y-6">
      {missing.length > 0 && (
        <Card className="border-destructive/40 bg-destructive/5 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-destructive" />
            <div className="text-sm">
              <p className="font-semibold">{missing.length} required business detail(s) still missing</p>
              <p className="mt-1 text-muted-foreground">
                Customer-facing fields stay hidden and legal pages remain marked incomplete until these are
                supplied by the business owner. Nothing is auto-filled.
              </p>
              <p className="mt-2">{missing.map((m) => m.label).join(" · ")}</p>
            </div>
          </div>
        </Card>
      )}

      <Card className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-display text-lg font-semibold">Business information</h3>
            <p className="text-sm text-muted-foreground">
              {supplied} of {FIELDS.length} fields supplied. Leave a field blank rather than entering a
              placeholder — blank fields are hidden from customers.
            </p>
          </div>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {FIELDS.map((f) => (
            <div key={f.key} className={f.multiline ? "md:col-span-2" : undefined}>
              <Label htmlFor={f.key} className="flex items-center gap-2">
                {f.label}
                {f.optional && <span className="text-xs text-muted-foreground">optional</span>}
                {!isSupplied(draft[f.key]) && (
                  <Badge variant="outline" className="border-destructive/50 text-destructive">
                    missing
                  </Badge>
                )}
              </Label>
              {f.multiline ? (
                <Textarea
                  id={f.key}
                  rows={3}
                  className="mt-1"
                  value={draft[f.key] ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                />
              ) : (
                <Input
                  id={f.key}
                  className="mt-1"
                  value={draft[f.key] ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                />
              )}
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-lg font-semibold">Legal readiness checklist</h3>
            <p className="text-sm text-muted-foreground">
              ECTA s43 disclosure items. Status:{" "}
              <Badge variant={legalMissing ? "outline" : "secondary"}>
                {(settings?.["legal_review_status"] as string) ?? "incomplete"}
              </Badge>{" "}
              · Last reviewed:{" "}
              {settings?.["legal_last_reviewed_at"]
                ? formatDate(settings["legal_last_reviewed_at"] as string)
                : "never"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              These pages are not legally approved. A qualified reviewer must sign them off before launch.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => markReviewed("in_review")}>
              Mark sent for legal review
            </Button>
            <Button variant="ghost" onClick={() => markReviewed("incomplete")}>
              Reset to incomplete
            </Button>
          </div>
        </div>
        <ul className="mt-4 divide-y divide-border text-sm">
          {legalRows.map((r) => (
            <li key={r.label} className="flex items-start gap-3 py-2">
              {r.ok ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-primary" />
              ) : (
                <CircleDashed className="mt-0.5 h-4 w-4 text-destructive" />
              )}
              <div className="flex-1">
                <p className={r.ok ? "" : "text-destructive"}>{r.label}</p>
                <p className="text-xs text-muted-foreground">
                  Page: {r.page} · {r.ok ? "information supplied" : "information missing"} · legal review
                  outstanding
                </p>
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm">
          {LEGAL_CHECKS.length - legalMissing} of {LEGAL_CHECKS.length} disclosure items have their
          information in place; {legalMissing} still need owner-supplied detail.
        </p>
      </Card>

      <Card className="p-5">
        <h3 className="font-display text-lg font-semibold">Collection configuration</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Collection is currently{" "}
          <Badge variant={shipping?.collection_enabled ? "secondary" : "outline"}>
            {shipping?.collection_enabled ? "enabled" : "disabled"}
          </Badge>
          . Courier delivery in Gauteng is unaffected by this setting.
        </p>
        {collectionBlocked && (
          <p className="mt-3 flex items-start gap-2 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4" />
            Collection cannot be enabled until a complete street collection address and operating hours are
            captured on the Shipping tab. The database rejects any attempt to enable it without one.
          </p>
        )}
      </Card>
    </div>
  );
}
