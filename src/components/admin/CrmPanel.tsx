import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
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
import { formatDate, formatZAR, ORDER_STATUS_LABELS } from "@/lib/format";
import type { Database } from "@/integrations/supabase/types";

type PipelineStage = Database["public"]["Enums"]["pipeline_stage"];
type TaskStatus = Database["public"]["Enums"]["crm_task_status"];

export const PIPELINE_LABELS: Record<PipelineStage, string> = {
  new: "New enquiry",
  contacted: "Contacted",
  quoted: "Quoted",
  negotiating: "Negotiating",
  won: "Won",
  lost: "Lost",
};

const TASK_LABELS: Record<TaskStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  done: "Done",
  cancelled: "Cancelled",
};

export function CrmPanel({ currentUserId }: { currentUserId: string }) {
  const qc = useQueryClient();
  const [term, setTerm] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["crm-customers"],
    queryFn: async () => {
      const [profiles, orders, staff] = await Promise.all([
        supabase.from("profiles").select("id, email, full_name, phone, created_at"),
        supabase
          .from("orders")
          .select(
            "id, order_number, user_id, contact_name, contact_email, status, pipeline_stage, assigned_to, total_incl_vat, created_at",
          )
          .order("created_at", { ascending: false }),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      if (profiles.error) throw profiles.error;
      if (orders.error) throw orders.error;
      if (staff.error) throw staff.error;
      const staffIds = new Set(
        (staff.data ?? [])
          .filter((r) =>
            ["super_admin", "admin", "catalogue_manager", "order_manager"].includes(r.role),
          )
          .map((r) => r.user_id),
      );
      return {
        profiles: profiles.data ?? [],
        orders: orders.data ?? [],
        staff: (profiles.data ?? []).filter((p) => staffIds.has(p.id)),
      };
    },
  });

  const customers = useMemo(() => {
    const q = term.trim().toLowerCase();
    return (data?.profiles ?? [])
      .map((p) => {
        const orders = (data?.orders ?? []).filter((o) => o.user_id === p.id);
        return {
          ...p,
          orderCount: orders.length,
          lifetimeValue: orders
            .filter((o) => !["cancelled", "refunded"].includes(o.status))
            .reduce((sum, o) => sum + Number(o.total_incl_vat ?? 0), 0),
          lastOrder: orders[0]?.created_at ?? null,
          orders,
        };
      })
      .filter((c) =>
        q
          ? (c.email ?? "").toLowerCase().includes(q) ||
            (c.full_name ?? "").toLowerCase().includes(q)
          : true,
      )
      .sort((a, b) => b.lifetimeValue - a.lifetimeValue);
  }, [data, term]);

  const current = customers.find((c) => c.id === selected) ?? null;

  const updateOrder = useMutation({
    mutationFn: async ({
      orderId,
      patch,
    }: {
      orderId: string;
      patch: { pipeline_stage?: PipelineStage; assigned_to?: string | null };
    }) => {
      const { error } = await supabase.from("orders").update(patch).eq("id", orderId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Order updated");
      qc.invalidateQueries({ queryKey: ["crm-customers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <Skeleton className="h-96 w-full" />;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <div className="space-y-3">
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search customers…"
          aria-label="Search customers"
        />
        <div className="rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead className="text-right">Orders</TableHead>
                <TableHead className="text-right">Lifetime value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map((c) => (
                <TableRow
                  key={c.id}
                  className={`cursor-pointer ${selected === c.id ? "bg-muted" : ""}`}
                  onClick={() => setSelected(c.id)}
                >
                  <TableCell>
                    <div className="font-medium">{c.full_name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{c.email}</div>
                  </TableCell>
                  <TableCell className="text-right">{c.orderCount}</TableCell>
                  <TableCell className="text-right font-medium">
                    {formatZAR(c.lifetimeValue)}
                  </TableCell>
                </TableRow>
              ))}
              {customers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                    No customers yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <div>
        {!current ? (
          <Card className="flex h-full items-center justify-center p-10 text-center text-muted-foreground">
            Select a customer to see their history, notes and follow-ups.
          </Card>
        ) : (
          <Card className="space-y-6 p-6">
            <div>
              <h2 className="font-display text-xl font-bold">{current.full_name ?? "Customer"}</h2>
              <p className="text-sm text-muted-foreground">{current.email}</p>
              {current.phone && (
                <p className="text-sm text-muted-foreground">{current.phone}</p>
              )}
              <div className="mt-3 flex flex-wrap gap-4 text-sm">
                <span>
                  <strong>{current.orderCount}</strong> orders
                </span>
                <span>
                  <strong>{formatZAR(current.lifetimeValue)}</strong> lifetime
                </span>
                <span>
                  Last order:{" "}
                  <strong>{current.lastOrder ? formatDate(current.lastOrder) : "—"}</strong>
                </span>
              </div>
            </div>

            <Separator />

            <section>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.12em]">
                Orders &amp; pipeline
              </h3>
              <div className="space-y-3">
                {current.orders.length === 0 && (
                  <p className="text-sm text-muted-foreground">No orders yet.</p>
                )}
                {current.orders.map((o) => (
                  <div
                    key={o.id}
                    className="rounded-md border border-border p-3 text-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="font-medium">{o.order_number}</span>{" "}
                        <span className="text-muted-foreground">
                          · {formatDate(o.created_at)} · {formatZAR(Number(o.total_incl_vat))}
                        </span>
                      </div>
                      <Badge variant="secondary">{ORDER_STATUS_LABELS[o.status] ?? o.status}</Badge>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <Select
                        value={o.pipeline_stage ?? "new"}
                        onValueChange={(v) =>
                          updateOrder.mutate({
                            orderId: o.id,
                            patch: { pipeline_stage: v as PipelineStage },
                          })
                        }
                      >
                        <SelectTrigger aria-label="Pipeline stage">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.keys(PIPELINE_LABELS) as PipelineStage[]).map((s) => (
                            <SelectItem key={s} value={s}>
                              {PIPELINE_LABELS[s]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select
                        value={o.assigned_to ?? "unassigned"}
                        onValueChange={(v) =>
                          updateOrder.mutate({
                            orderId: o.id,
                            patch: { assigned_to: v === "unassigned" ? null : v },
                          })
                        }
                      >
                        <SelectTrigger aria-label="Assigned owner">
                          <SelectValue placeholder="Unassigned" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unassigned">Unassigned</SelectItem>
                          {(data?.staff ?? []).map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.full_name ?? s.email}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <Separator />

            <NotesSection customerId={current.id} currentUserId={currentUserId} />

            <Separator />

            <TasksSection
              customerId={current.id}
              currentUserId={currentUserId}
              staff={data?.staff ?? []}
            />
          </Card>
        )}
      </div>
    </div>
  );
}

function NotesSection({
  customerId,
  currentUserId,
}: {
  customerId: string;
  currentUserId: string;
}) {
  const qc = useQueryClient();
  const [body, setBody] = useState("");

  const { data: notes } = useQuery({
    queryKey: ["crm-notes", customerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crm_notes")
        .select("id, body, created_at, created_by")
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const addNote = useMutation({
    mutationFn: async () => {
      const text = body.trim();
      if (!text) throw new Error("Note cannot be empty");
      if (text.length > 2000) throw new Error("Note must be under 2000 characters");
      const { error } = await supabase
        .from("crm_notes")
        .insert({ customer_id: customerId, body: text, created_by: currentUserId });
      if (error) throw error;
    },
    onSuccess: () => {
      setBody("");
      qc.invalidateQueries({ queryKey: ["crm-notes", customerId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section>
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.12em]">Notes</h3>
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Log a call, email or meeting…"
        maxLength={2000}
        rows={3}
      />
      <Button
        size="sm"
        className="mt-2"
        disabled={addNote.isPending || !body.trim()}
        onClick={() => addNote.mutate()}
      >
        Add note
      </Button>
      <ul className="mt-4 space-y-3">
        {(notes ?? []).map((n) => (
          <li key={n.id} className="rounded-md border border-border p-3 text-sm">
            <p className="whitespace-pre-wrap">{n.body}</p>
            <p className="mt-1 text-xs text-muted-foreground">{formatDate(n.created_at)}</p>
          </li>
        ))}
        {(notes ?? []).length === 0 && (
          <li className="text-sm text-muted-foreground">No notes yet.</li>
        )}
      </ul>
    </section>
  );
}

function TasksSection({
  customerId,
  currentUserId,
  staff,
}: {
  customerId: string;
  currentUserId: string;
  staff: { id: string; full_name: string | null; email: string | null }[];
}) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [assignee, setAssignee] = useState(currentUserId);

  const { data: tasks } = useQuery({
    queryKey: ["crm-tasks", customerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crm_tasks")
        .select("id, title, due_date, status, assigned_to")
        .eq("customer_id", customerId)
        .order("due_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const addTask = useMutation({
    mutationFn: async () => {
      const text = title.trim();
      if (!text) throw new Error("Task needs a title");
      if (text.length > 200) throw new Error("Title must be under 200 characters");
      const { error } = await supabase.from("crm_tasks").insert({
        customer_id: customerId,
        title: text,
        due_date: due || null,
        assigned_to: assignee || null,
        created_by: currentUserId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setTitle("");
      setDue("");
      qc.invalidateQueries({ queryKey: ["crm-tasks", customerId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: TaskStatus }) => {
      const { error } = await supabase.from("crm_tasks").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-tasks", customerId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section>
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.12em]">Follow-ups</h3>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Call back with stock ETA"
          maxLength={200}
          aria-label="Task title"
        />
        <div>
          <Label className="sr-only" htmlFor="task-due">
            Due date
          </Label>
          <Input id="task-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </div>
        <Select value={assignee} onValueChange={setAssignee}>
          <SelectTrigger className="min-w-40" aria-label="Assign to">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {staff.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.full_name ?? s.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button disabled={addTask.isPending || !title.trim()} onClick={() => addTask.mutate()}>
          Add
        </Button>
      </div>

      <ul className="mt-4 space-y-2">
        {(tasks ?? []).map((t) => (
          <li
            key={t.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3 text-sm"
          >
            <div>
              <span className={t.status === "done" ? "line-through opacity-60" : ""}>
                {t.title}
              </span>
              {t.due_date && (
                <span className="ml-2 text-xs text-muted-foreground">
                  due {formatDate(t.due_date)}
                </span>
              )}
            </div>
            <Select
              value={t.status}
              onValueChange={(v) => setStatus.mutate({ id: t.id, status: v as TaskStatus })}
            >
              <SelectTrigger className="w-36" aria-label="Task status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(TASK_LABELS) as TaskStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {TASK_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </li>
        ))}
        {(tasks ?? []).length === 0 && (
          <li className="text-sm text-muted-foreground">No follow-ups scheduled.</li>
        )}
      </ul>
    </section>
  );
}
