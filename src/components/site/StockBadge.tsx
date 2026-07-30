import { Badge } from "@/components/ui/badge";
import { STOCK_LABELS } from "@/lib/format";

const VARIANTS: Record<string, string> = {
  available: "bg-success text-success-foreground",
  low_stock: "bg-warning text-warning-foreground",
  preorder: "bg-accent text-accent-foreground",
  awaiting_confirmation: "bg-muted text-muted-foreground",
  out_of_stock: "bg-destructive text-destructive-foreground",
  discontinued: "bg-muted text-muted-foreground",
};

export function StockBadge({ status, quantity }: { status: string; quantity?: number | null }) {
  const label =
    status === "low_stock" && quantity ? `Only ${quantity} left` : (STOCK_LABELS[status] ?? status);
  return (
    <Badge className={`${VARIANTS[status] ?? "bg-muted text-muted-foreground"} border-0`}>{label}</Badge>
  );
}
