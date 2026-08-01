import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ImageOff, ListChecks, Tag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { formatZAR } from "@/lib/format";

type Row = {
  id: string;
  sku: string;
  name: string;
  is_published: boolean;
  image_required: boolean;
  brand_review_required: boolean;
  supplier_price_anomaly: boolean;
  spec_review_required: boolean;
  review_locked: boolean;
  catalogue_review_reason: string | null;
  supplier_sku: string | null;
  model_number: string | null;
  dealer_price_ex_vat: number | null;
  promotional_price_ex_vat: number | null;
  source_workbook: string | null;
  source_worksheet: string | null;
  source_row_number: number | null;
};

const Source = ({ r }: { r: Row }) =>
  r.source_workbook ? (
    <p className="mt-1 text-xs text-muted-foreground">
      Source: {r.source_workbook} · {r.source_worksheet ?? "—"} · row {r.source_row_number ?? "—"}
    </p>
  ) : (
    <p className="mt-1 text-xs text-muted-foreground">Source: original demo seed data (no supplier file)</p>
  );

function Group({
  title,
  icon,
  hint,
  rows,
  render,
}: {
  title: string;
  icon: React.ReactNode;
  hint: string;
  rows: Row[];
  render?: (r: Row) => React.ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2">
        {icon}
        <h3 className="font-display text-lg font-semibold">{title}</h3>
        <Badge variant="outline">{rows.length}</Badge>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
      <ul className="mt-4 divide-y divide-border">
        {rows.length === 0 && <li className="py-2 text-sm text-muted-foreground">Nothing outstanding.</li>}
        {rows.map((r) => (
          <li key={r.id} className="py-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{r.name}</span>
              <Badge variant="secondary">{r.sku}</Badge>
              {r.supplier_sku && <Badge variant="outline">supplier: {r.supplier_sku}</Badge>}
              {r.model_number && <Badge variant="outline">model: {r.model_number}</Badge>}
              <Badge variant={r.is_published ? "secondary" : "outline"}>
                {r.is_published ? "published" : "unpublished"}
              </Badge>
              {r.review_locked && <Badge variant="destructive">locked</Badge>}
            </div>
            {r.catalogue_review_reason && <p className="mt-1 text-muted-foreground">{r.catalogue_review_reason}</p>}
            {render?.(r)}
            <Source r={r} />
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function ReviewQueuePanel() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "review-queue"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select(
          "id, sku, name, is_published, image_required, brand_review_required, supplier_price_anomaly, spec_review_required, review_locked, catalogue_review_reason, supplier_sku, model_number, dealer_price_ex_vat, promotional_price_ex_vat, source_workbook, source_worksheet, source_row_number",
        )
        .or(
          "image_required.eq.true,brand_review_required.eq.true,supplier_price_anomaly.eq.true,spec_review_required.eq.true",
        )
        .order("sku")
        .limit(500);
      if (error) throw error;
      return data as unknown as Row[];
    },
  });

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  const rows = data ?? [];

  return (
    <div className="space-y-4">
      <Group
        title="Brand confirmation required"
        icon={<Tag className="h-5 w-5 text-destructive" />}
        hint="Do not assign a brand without written supplier confirmation."
        rows={rows.filter((r) => r.brand_review_required)}
      />
      <Group
        title="Supplier price anomaly"
        icon={<AlertTriangle className="h-5 w-5 text-destructive" />}
        hint="High risk. Locked against automatic republishing or repricing until an administrator approves the supplier's figures."
        rows={rows.filter((r) => r.supplier_price_anomaly)}
        render={(r) => (
          <p className="mt-1">
            List price {r.dealer_price_ex_vat != null ? formatZAR(r.dealer_price_ex_vat) : "—"} ex VAT vs
            promotional {r.promotional_price_ex_vat != null ? formatZAR(r.promotional_price_ex_vat) : "—"} ex
            VAT — both values preserved exactly as supplied.
          </p>
        )}
      />
      <Group
        title="Image required — held back from the storefront"
        icon={<ImageOff className="h-5 w-5 text-destructive" />}
        hint="Kept unpublished. Do not substitute generic or unrelated imagery."
        rows={rows.filter((r) => r.image_required)}
      />
      <Group
        title="Specifications missing"
        icon={<ListChecks className="h-5 w-5 text-muted-foreground" />}
        hint="Original demo seed products. Specifications must come from a verified source — nothing is generated."
        rows={rows.filter((r) => r.spec_review_required)}
      />
    </div>
  );
}
