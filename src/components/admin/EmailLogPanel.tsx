import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, RefreshCw, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { retryEmailEvent, sendTestEmail } from "@/lib/email.functions";

const TONE: Record<string, string> = {
  sent: "bg-emerald-100 text-emerald-800",
  pending: "bg-sky-100 text-sky-800",
  failed: "bg-red-100 text-red-800",
  skipped_duplicate: "bg-muted text-muted-foreground",
  suppressed: "bg-amber-100 text-amber-900",
};

export function EmailLogPanel({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [testTo, setTestTo] = useState("");
  const retry = useServerFn(retryEmailEvent);
  const test = useServerFn(sendTestEmail);

  const events = useQuery({
    queryKey: ["email-events"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_events")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });

  const failed = events.data?.filter((e) => e.status === "failed").length ?? 0;

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h3 className="font-display text-lg font-semibold">Email delivery</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Every notification TechNest attempts is recorded here. Orders are never blocked by an email failure — failed
          notifications stay retryable.
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="min-w-56 flex-1">
            <Label htmlFor="test-to">Send a delivery test to</Label>
            <Input id="test-to" type="email" className="mt-1" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="you@example.com" />
          </div>
          <Button
            disabled={!isAdmin || !!busy || !testTo}
            onClick={async () => {
              setBusy("test");
              const res: any = await test({ data: { recipient: testTo } });
              setBusy(null);
              res?.ok ? toast.success("Test message sent.") : toast.error(res?.outcome?.reason ?? "Delivery failed — see the log below.");
              qc.invalidateQueries({ queryKey: ["email-events"] });
            }}
          >
            {busy === "test" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            Send test
          </Button>
          {failed > 0 && <Badge className={TONE.failed}>{failed} failed</Badge>}
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="font-display text-lg font-semibold">Delivery log</h3>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="border-b text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-2">Event</th><th className="p-2">Recipient</th><th className="p-2">Order</th>
                <th className="p-2">Attempted</th><th className="p-2">Status</th><th className="p-2">Provider ID</th>
                <th className="p-2">Failure reason</th><th className="p-2">Retries</th><th className="p-2" />
              </tr>
            </thead>
            <tbody>
              {events.data?.map((e: any) => (
                <tr key={e.id} className="border-b align-top">
                  <td className="p-2">
                    {e.event_type.replace(/_/g, " ")}
                    {e.is_test && <Badge className="ml-2 bg-amber-100 text-amber-900">test</Badge>}
                  </td>
                  <td className="p-2">{e.recipient}</td>
                  <td className="p-2 text-xs">{e.order_id ? e.order_id.slice(0, 8) : "—"}</td>
                  <td className="p-2 text-xs">{e.attempted_at ? new Date(e.attempted_at).toLocaleString("en-ZA") : "—"}</td>
                  <td className="p-2"><Badge className={TONE[e.status]}>{e.status.replace(/_/g, " ")}</Badge></td>
                  <td className="p-2 text-xs">{e.provider_message_id ?? "—"}</td>
                  <td className="p-2 max-w-72 text-xs text-muted-foreground">{e.failure_reason ?? "—"}</td>
                  <td className="p-2">{e.retry_count}</td>
                  <td className="p-2 text-right">
                    {e.status !== "sent" && (
                      <Button size="sm" variant="outline" disabled={!isAdmin || !!busy}
                        onClick={async () => {
                          setBusy(e.id);
                          const res: any = await retry({ data: { event_id: e.id } });
                          setBusy(null);
                          res?.ok ? toast.success("Notification delivered.") : toast.error(res?.error ?? res?.outcome?.reason ?? "Retry failed.");
                          qc.invalidateQueries({ queryKey: ["email-events"] });
                        }}>
                        <RefreshCw className="mr-1 h-4 w-4" />Retry
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {events.data?.length === 0 && <p className="p-4 text-sm text-muted-foreground">No notifications recorded yet.</p>}
        </div>
      </Card>
    </div>
  );
}
