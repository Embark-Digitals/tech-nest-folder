import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";

const STATUSES = ["new", "in_progress", "resolved", "spam"] as const;

const REASON_LABEL: Record<string, string> = {
  general: "General",
  sales: "Sales",
  order_status: "Order status",
  delivery: "Delivery",
  returns: "Returns",
  warranty: "Warranty",
  billing: "Billing",
  other: "Other",
};

export function ContactInboxPanel() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<string>("open");

  const { data, isLoading } = useQuery({
    queryKey: ["contact-messages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contact_messages")
        .select("id, name, email, phone, order_number, reason, message, status, created_at")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
  });

  const setStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("contact_messages").update({ status }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Message updated");
    qc.invalidateQueries({ queryKey: ["contact-messages"] });
  };

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  const rows = (data ?? []).filter((m) =>
    filter === "all" ? true : filter === "open" ? m.status === "new" || m.status === "in_progress" : m.status === filter,
  );

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold">Contact inbox</h2>
          <p className="text-sm text-muted-foreground">
            Messages submitted from the public contact page. Only staff can read this inbox.
          </p>
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="all">All</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s.replace(/_/g, " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="mt-6 space-y-4">
        {rows.length === 0 && <p className="text-sm text-muted-foreground">No messages in this view.</p>}
        {rows.map((m) => (
          <div key={m.id} className="rounded-lg border border-border p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold">
                  {m.name}{" "}
                  <a href={`mailto:${m.email}`} className="text-sm font-normal text-primary hover:underline">
                    {m.email}
                  </a>
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(m.created_at).toLocaleString("en-ZA")}
                  {m.phone ? ` · ${m.phone}` : ""}
                  {m.order_number ? ` · Order ${m.order_number}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{REASON_LABEL[m.reason] ?? m.reason}</Badge>
                <Badge variant={m.status === "new" ? "default" : "outline"}>{m.status.replace(/_/g, " ")}</Badge>
              </div>
            </div>
            <p className="mt-3 whitespace-pre-wrap text-sm">{m.message}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {STATUSES.filter((s) => s !== m.status).map((s) => (
                <Button key={s} size="sm" variant="outline" onClick={() => setStatus(m.id, s)}>
                  Mark {s.replace(/_/g, " ")}
                </Button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
