import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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
import { supabase } from "@/integrations/supabase/client";
import { formatZAR } from "@/lib/format";
import { PIPELINE_LABELS } from "./CrmPanel";

const RANGES = { "30": "Last 30 days", "90": "Last 90 days", "365": "Last 12 months", all: "All time" };

export function ReportsPanel() {
  const [range, setRange] = useState<keyof typeof RANGES>("30");

  const { data, isLoading } = useQuery({
    queryKey: ["crm-reports"],
    queryFn: async () => {
      const [orders, items] = await Promise.all([
        supabase
          .from("orders")
          .select("id, status, pipeline_stage, total_incl_vat, created_at"),
        supabase.from("order_items").select("name, quantity, line_total_incl_vat, created_at"),
      ]);
      if (orders.error) throw orders.error;
      if (items.error) throw items.error;
      return { orders: orders.data ?? [], items: items.data ?? [] };
    },
  });

  const stats = useMemo(() => {
    const since =
      range === "all" ? 0 : Date.now() - Number(range) * 24 * 60 * 60 * 1000;
    const orders = (data?.orders ?? []).filter(
      (o) => new Date(o.created_at).getTime() >= since,
    );
    const items = (data?.items ?? []).filter(
      (i) => new Date(i.created_at).getTime() >= since,
    );
    const valid = orders.filter((o) => !["cancelled", "refunded"].includes(o.status));
    const revenue = valid.reduce((s, o) => s + Number(o.total_incl_vat ?? 0), 0);
    const won = orders.filter((o) => o.pipeline_stage === "won").length;

    const byProduct = new Map<string, { qty: number; value: number }>();
    for (const i of items) {
      const prev = byProduct.get(i.name) ?? { qty: 0, value: 0 };
      byProduct.set(i.name, {
        qty: prev.qty + (i.quantity ?? 0),
        value: prev.value + Number(i.line_total_incl_vat ?? 0),
      });
    }
    const topProducts = [...byProduct.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);

    const pipeline = (Object.keys(PIPELINE_LABELS) as (keyof typeof PIPELINE_LABELS)[]).map(
      (stage) => ({
        stage,
        count: orders.filter((o) => o.pipeline_stage === stage).length,
      }),
    );

    return {
      orderCount: orders.length,
      revenue,
      avgOrder: valid.length ? revenue / valid.length : 0,
      conversion: orders.length ? (won / orders.length) * 100 : 0,
      topProducts,
      pipeline,
    };
  }, [data, range]);

  if (isLoading) return <Skeleton className="h-96 w-full" />;

  return (
    <div className="space-y-6">
      <Select value={range} onValueChange={(v) => setRange(v as keyof typeof RANGES)}>
        <SelectTrigger className="w-56" aria-label="Reporting period">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(RANGES).map(([k, label]) => (
            <SelectItem key={k} value={k}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Orders" value={String(stats.orderCount)} />
        <Stat label="Revenue (incl. VAT)" value={formatZAR(stats.revenue)} />
        <Stat label="Average order" value={formatZAR(stats.avgOrder)} />
        <Stat label="Won rate" value={`${stats.conversion.toFixed(1)}%`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.12em]">Pipeline</h3>
          <Table>
            <TableBody>
              {stats.pipeline.map((p) => (
                <TableRow key={p.stage}>
                  <TableCell>{PIPELINE_LABELS[p.stage]}</TableCell>
                  <TableCell className="text-right font-medium">{p.count}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>

        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.12em]">Top products</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats.topProducts.map((p) => (
                <TableRow key={p.name}>
                  <TableCell className="max-w-64 truncate">{p.name}</TableCell>
                  <TableCell className="text-right">{p.qty}</TableCell>
                  <TableCell className="text-right">{formatZAR(p.value)}</TableCell>
                </TableRow>
              ))}
              {stats.topProducts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="py-6 text-center text-muted-foreground">
                    No sales in this period.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold">{value}</p>
    </Card>
  );
}
