import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { formatDate, formatZAR, ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS } from "@/lib/format";
import { OrderDetailSheet } from "@/components/admin/OrderDetailSheet";

const PAGE = 25;

export function OrdersPanel({
  isAdmin,
  currentUserId,
}: {
  isAdmin: boolean;
  currentUserId: string;
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("open");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["admin-orders", search, status, page],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let q = supabase
        .from("orders")
        .select(
          "id, order_number, contact_name, contact_email, contact_phone, status, total_incl_vat, created_at, payment_status, payment_reference, delivery_zone_name",
          { count: "exact" },
        )
        .order("created_at", { ascending: false });
      if (status === "open") q = q.not("status", "in", "(delivered,cancelled,refunded)");
      else if (status === "unpaid")
        q = q.eq("payment_status", "unpaid").not("status", "in", "(cancelled,refunded)");
      else if (status !== "all") q = q.eq("status", status as never);
      const s = search
        .trim()
        .replace(/[%,()*]/g, " ")
        .trim();
      if (s)
        q = q.or(`order_number.ilike.%${s}%,contact_name.ilike.%${s}%,contact_email.ilike.%${s}%`);
      const { data, error, count } = await q.range(page * PAGE, page * PAGE + PAGE - 1);
      if (error) throw error;
      return { rows: data ?? [], total: count ?? 0 };
    },
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));

  return (
    <>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Input
          placeholder="Search order no., name or email"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
          aria-label="Search orders"
        />
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v);
            setPage(0);
          }}
        >
          <SelectTrigger aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="open">Open orders</SelectItem>
            <SelectItem value="unpaid">Unpaid</SelectItem>
            <SelectItem value="all">All orders</SelectItem>
            {Object.entries(ORDER_STATUS_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="self-center text-sm text-muted-foreground">
          {total} order{total === 1 ? "" : "s"}
          {isFetching && !isLoading ? " · updating…" : ""}
        </p>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
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
              {rows.map((o) => (
                <TableRow
                  key={o.id}
                  className="cursor-pointer"
                  onClick={() => setSelected(o.id)}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setSelected(o.id)}
                  tabIndex={0}
                  aria-label={`Open order ${o.order_number}`}
                >
                  <TableCell className="font-medium">{o.order_number}</TableCell>
                  <TableCell>
                    {o.contact_name}
                    <span className="block text-xs text-muted-foreground">
                      {o.contact_email}
                      {o.contact_phone ? ` · ${o.contact_phone}` : ""}
                    </span>
                  </TableCell>
                  <TableCell>{formatDate(o.created_at)}</TableCell>
                  <TableCell>{formatZAR(Number(o.total_incl_vat))}</TableCell>
                  <TableCell>
                    <Badge
                      className={
                        o.payment_status === "paid"
                          ? "border-0 bg-emerald-100 text-emerald-800"
                          : o.payment_status === "unpaid"
                            ? "border-0 bg-amber-100 text-amber-900"
                            : "border-0 bg-muted text-muted-foreground"
                      }
                    >
                      {PAYMENT_STATUS_LABELS[o.payment_status] ?? o.payment_status}
                    </Badge>
                  </TableCell>
                  <TableCell>{ORDER_STATUS_LABELS[o.status] ?? o.status}</TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                    No orders match.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      )}

      {pages > 1 && (
        <div className="mt-4 flex items-center justify-end gap-2 text-sm">
          <Button
            size="sm"
            variant="outline"
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </Button>
          <span>
            Page {page + 1} of {pages}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={page + 1 >= pages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}

      <OrderDetailSheet
        orderId={selected}
        onClose={() => setSelected(null)}
        isAdmin={isAdmin}
        currentUserId={currentUserId}
      />
    </>
  );
}
