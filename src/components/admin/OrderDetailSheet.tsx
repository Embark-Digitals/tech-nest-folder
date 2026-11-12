import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Mail, MessageCircle, Phone } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { trackOnce } from "@/lib/analytics";
import { notifyOrderEvent } from "@/lib/email.functions";
import {
  formatDate,
  formatZAR,
  ORDER_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  VAT_RATE,
} from "@/lib/format";
import {
  canRecordPayment,
  canRecordRefund,
  formatAddress,
  nextStatuses,
  STATUS_EMAIL,
  whatsappLink,
} from "@/lib/order-workflow";

type Props = {
  orderId: string | null;
  onClose: () => void;
  isAdmin: boolean;
  currentUserId: string;
};

const money = (v: unknown) => formatZAR(v === null || v === undefined ? null : Number(v));

export function OrderDetailSheet({ orderId, onClose, isAdmin, currentUserId }: Props) {
  const qc = useQueryClient();
  const notify = useServerFn(notifyOrderEvent);

  const order = useQuery({
    queryKey: ["admin-order", orderId],
    enabled: !!orderId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*, order_items(*), order_status_history(*)")
        .eq("id", orderId!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const fulfilment = useQuery({
    queryKey: ["admin-order-fulfilment", orderId],
    enabled: !!orderId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_fulfilment")
        .select("*")
        .eq("order_id", orderId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const costs = useQuery({
    queryKey: ["admin-order-costs", orderId],
    enabled: !!orderId && isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_item_costs")
        .select("*")
        .eq("order_id", orderId!);
      if (error) throw error;
      return data;
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin-orders"] });
    qc.invalidateQueries({ queryKey: ["admin-order", orderId] });
  };

  // ---------------------------------------------------------------- status
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const [statusNote, setStatusNote] = useState("");
  const changeStatus = useMutation({
    mutationFn: async () => {
      const o = order.data!;
      const { error } = await supabase.rpc("set_order_status", {
        _order_id: o.id,
        _status: pendingStatus as never,
        _note: statusNote.trim() || undefined,
      });
      if (error) throw error;
      return { o, status: pendingStatus! };
    },
    onSuccess: ({ o, status }) => {
      toast.success(`Order moved to ${ORDER_STATUS_LABELS[status] ?? status}`);
      if (status === "cancelled") {
        trackOnce("order_cancelled", o.id, {
          transaction_id: o.order_number,
          value: Number(o.total_incl_vat),
          was_paid: o.payment_status === "paid",
        });
      }
      // Best-effort: a failed email is logged in the Emails tab.
      void notify({
        data: { order_id: o.id, event: (STATUS_EMAIL[status] ?? "order_status_update") as never },
      });
      setPendingStatus(null);
      setStatusNote("");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ---------------------------------------------------------------- payment
  const [payOpen, setPayOpen] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payRef, setPayRef] = useState("");
  const recordPayment = useMutation({
    mutationFn: async () => {
      const o = order.data!;
      const amount = Number(payAmount.replace(/[^\d.]/g, ""));
      const { error } = await supabase.rpc("confirm_manual_eft", {
        _order_id: o.id,
        _payment_reference: payRef.trim(),
        _amount_incl_vat: amount,
      });
      if (error) {
        if (/does not match/i.test(error.message)) {
          throw new Error(
            `The amount received (${formatZAR(amount)}) does not match the order total of ${money(o.total_incl_vat)}. Contact the customer before recording a part payment.`,
          );
        }
        throw error;
      }
      return o;
    },
    onSuccess: (o) => {
      toast.success("Payment recorded");
      // Payment is settled, so this is the only point at which revenue may be reported.
      const value = Number(o.total_incl_vat);
      trackOnce("payment_confirmed", o.id, {
        transaction_id: o.order_number,
        value,
        payment_method: "manual_eft",
      });
      trackOnce("purchase", o.id, {
        transaction_id: o.order_number,
        value,
        payment_method: "manual_eft",
      });
      void notify({ data: { order_id: o.id, event: "order_payment_received" } });
      setPayOpen(false);
      setPayAmount("");
      setPayRef("");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message, { duration: 10000 }),
  });

  // ---------------------------------------------------------------- refund
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundRef, setRefundRef] = useState("");
  const [refundNote, setRefundNote] = useState("");
  const recordRefund = useMutation({
    mutationFn: async () => {
      const o = order.data!;
      const amount = Number(refundAmount.replace(/[^\d.]/g, ""));
      const { data, error } = await supabase.rpc("record_refund", {
        _order_id: o.id,
        _amount_incl_vat: amount,
        _reference: refundRef.trim(),
        _note: refundNote.trim() || undefined,
      });
      if (error) throw error;
      return { o, amount, full: (data as { status?: string } | null)?.status === "refunded" };
    },
    onSuccess: ({ o, amount, full }) => {
      toast.success(full ? "Refund recorded — order refunded in full" : "Part refund recorded");
      trackOnce("refund", `${o.id}:${amount}`, { transaction_id: o.order_number, value: amount });
      if (full) void notify({ data: { order_id: o.id, event: "order_refunded" } });
      setRefundOpen(false);
      setRefundAmount("");
      setRefundRef("");
      setRefundNote("");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message, { duration: 10000 }),
  });

  // ---------------------------------------------------------------- notes
  const [notes, setNotes] = useState("");
  useEffect(
    () => setNotes(order.data?.admin_notes ?? ""),
    [order.data?.id, order.data?.admin_notes],
  );
  const saveNotes = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("orders")
        .update({ admin_notes: notes.trim() || null })
        .eq("id", orderId!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Internal notes saved");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ---------------------------------------------------------------- Atlas leg
  const [ful, setFul] = useState({
    supplier_order_ref: "",
    supplier_invoice_ref: "",
    ordered_with_supplier_at: "",
    courier: "",
    tracking_number: "",
  });
  useEffect(() => {
    const f = fulfilment.data;
    setFul({
      supplier_order_ref: f?.supplier_order_ref ?? "",
      supplier_invoice_ref: f?.supplier_invoice_ref ?? "",
      ordered_with_supplier_at: f?.ordered_with_supplier_at?.slice(0, 10) ?? "",
      courier: f?.courier ?? "",
      tracking_number: f?.tracking_number ?? "",
    });
  }, [fulfilment.data, orderId]);
  const saveFulfilment = useMutation({
    mutationFn: async () => {
      const blank = (s: string) => s.trim() || null;
      const { error } = await supabase.from("order_fulfilment").upsert({
        order_id: orderId!,
        supplier_order_ref: blank(ful.supplier_order_ref),
        supplier_invoice_ref: blank(ful.supplier_invoice_ref),
        ordered_with_supplier_at: ful.ordered_with_supplier_at
          ? new Date(ful.ordered_with_supplier_at).toISOString()
          : null,
        courier: blank(ful.courier),
        tracking_number: blank(ful.tracking_number),
        updated_by: currentUserId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Atlas details saved");
      qc.invalidateQueries({ queryKey: ["admin-order-fulfilment", orderId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [actualCosts, setActualCosts] = useState<Record<string, string>>({});
  useEffect(() => {
    const next: Record<string, string> = {};
    for (const c of costs.data ?? [])
      next[c.order_item_id] = c.actual_unit_cost_ex_vat?.toString() ?? "";
    setActualCosts(next);
  }, [costs.data]);
  const saveCost = useMutation({
    mutationFn: async (itemId: string) => {
      const raw = (actualCosts[itemId] ?? "").replace(/[^\d.]/g, "");
      const { error } = await supabase
        .from("order_item_costs")
        .update({ actual_unit_cost_ex_vat: raw ? Number(raw) : null })
        .eq("order_item_id", itemId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cost saved");
      qc.invalidateQueries({ queryKey: ["admin-order-costs", orderId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ---------------------------------------------------------------- render
  const o = order.data;
  const items = o?.order_items ?? [];
  const history = [...(o?.order_status_history ?? [])].sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  );
  const options = o ? nextStatuses(o.status, o.payment_status) : [];
  const blockedByPayment = o
    ? nextStatuses(o.status, "paid").length > options.length && o.payment_status !== "paid"
    : false;
  const address = formatAddress(o?.delivery_address);
  const surcharges = Array.isArray(o?.delivery_surcharges)
    ? (o!.delivery_surcharges as { label?: string; amount?: number }[])
    : [];
  const wa = whatsappLink(o?.contact_phone);

  const costByItem = new Map((costs.data ?? []).map((c) => [c.order_item_id, c]));
  const marginRows = items.map((i) => {
    const c = costByItem.get(i.id);
    const unitCost = c?.actual_unit_cost_ex_vat ?? c?.expected_unit_cost_ex_vat ?? null;
    const unitSaleEx = Number(i.unit_price_incl_vat) / (1 + VAT_RATE);
    const margin = unitCost === null ? null : (unitSaleEx - Number(unitCost)) * i.quantity;
    return { item: i, cost: c, unitCost, unitSaleEx, margin };
  });
  const knownMargins = marginRows.filter((m) => m.margin !== null);
  const totalMargin = knownMargins.reduce((s, m) => s + (m.margin ?? 0), 0);
  const totalSaleEx = marginRows.reduce((s, m) => s + m.unitSaleEx * m.item.quantity, 0);

  return (
    <Sheet open={!!orderId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
        {!o ? (
          <div className="space-y-4 pt-8">
            <Skeleton className="h-8 w-1/2" />
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <>
            <SheetHeader>
              <SheetTitle className="font-display text-2xl">Order {o.order_number}</SheetTitle>
              <SheetDescription>Placed {formatDate(o.created_at)}</SheetDescription>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{ORDER_STATUS_LABELS[o.status] ?? o.status}</Badge>
                <Badge
                  className={
                    o.payment_status === "paid"
                      ? "border-0 bg-emerald-100 text-emerald-800"
                      : "border-0 bg-amber-100 text-amber-900"
                  }
                >
                  {PAYMENT_STATUS_LABELS[o.payment_status] ?? o.payment_status}
                  {o.payment_reference ? ` · ${o.payment_reference}` : ""}
                </Badge>
              </div>
            </SheetHeader>

            {/* actions */}
            <div className="mt-5 flex flex-wrap items-end gap-2 rounded-lg border bg-muted/30 p-3">
              <div>
                <Label className="text-xs">Move to</Label>
                <Select
                  value=""
                  onValueChange={(v) => setPendingStatus(v)}
                  disabled={!options.length}
                >
                  <SelectTrigger className="mt-1 w-56">
                    <SelectValue
                      placeholder={options.length ? "Choose next step" : "No further steps"}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {options.map((s) => (
                      <SelectItem key={s} value={s}>
                        {ORDER_STATUS_LABELS[s] ?? s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {isAdmin && canRecordPayment(o) && (
                <Button variant="outline" onClick={() => setPayOpen(true)}>
                  Record payment
                </Button>
              )}
              {isAdmin && canRecordRefund(o) && (
                <Button variant="outline" onClick={() => setRefundOpen(true)}>
                  Record refund
                </Button>
              )}
              {blockedByPayment && (
                <p className="w-full text-xs text-amber-800">
                  Processing and dispatch unlock once a payment is recorded.
                </p>
              )}
            </div>

            {/* customer */}
            <Section title="Customer">
              <p className="font-medium">{o.contact_name}</p>
              <p className="flex items-center gap-2 text-sm">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <a className="hover:underline" href={`mailto:${o.contact_email}`}>
                  {o.contact_email}
                </a>
              </p>
              {o.contact_phone && (
                <p className="flex flex-wrap items-center gap-2 text-sm">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <a className="hover:underline" href={`tel:${o.contact_phone}`}>
                    {o.contact_phone}
                  </a>
                  {wa && (
                    <a
                      className="inline-flex items-center gap-1 text-emerald-700 hover:underline"
                      href={wa}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <MessageCircle className="h-4 w-4" />
                      WhatsApp
                    </a>
                  )}
                </p>
              )}
            </Section>

            {/* delivery */}
            <Section title="Delivery">
              <p className="text-sm">
                {o.delivery_method === "collection" ? "Collection" : "Courier delivery"}
                {o.delivery_zone_name ? ` · ${o.delivery_zone_name}` : ""}
                {o.delivery_estimate ? ` · ${o.delivery_estimate}` : ""}
              </p>
              {address.length > 0 && (
                <address className="mt-1 text-sm not-italic text-muted-foreground">
                  {address.map((l) => (
                    <div key={l}>{l}</div>
                  ))}
                </address>
              )}
              {surcharges.length > 0 && (
                <ul className="mt-2 text-xs text-muted-foreground">
                  {surcharges.map((s, i) => (
                    <li key={i}>
                      {s.label ?? "Surcharge"}: {money(s.amount)}
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            {/* items */}
            <Section title="Items">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="py-1">Product</th>
                    <th className="py-1 text-right">Qty</th>
                    <th className="py-1 text-right">Unit</th>
                    <th className="py-1 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((i) => (
                    <tr key={i.id} className="border-t align-top">
                      <td className="py-2">
                        {i.name}
                        <span className="block text-xs text-muted-foreground">SKU {i.sku}</span>
                      </td>
                      <td className="py-2 text-right">{i.quantity}</td>
                      <td className="py-2 text-right">{money(i.unit_price_incl_vat)}</td>
                      <td className="py-2 text-right">{money(i.line_total_incl_vat)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <dl className="mt-3 space-y-1 border-t pt-3 text-sm">
                <Row label="Items (incl. VAT)" value={money(o.subtotal_incl_vat)} />
                <Row label="Delivery" value={money(o.delivery_fee)} />
                <Row label="VAT included" value={money(o.vat_amount)} />
                <Row label="Total" value={money(o.total_incl_vat)} strong />
                {o.refunded_amount != null && (
                  <Row label="Refunded" value={money(o.refunded_amount)} />
                )}
              </dl>
              {o.customer_notes && (
                <p className="mt-3 rounded-md bg-muted p-3 text-sm">
                  <span className="font-medium">Customer note: </span>
                  {o.customer_notes}
                </p>
              )}
            </Section>

            {/* Atlas */}
            <Section title="Atlas order">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  label="Atlas order ref"
                  value={ful.supplier_order_ref}
                  onChange={(v) => setFul({ ...ful, supplier_order_ref: v })}
                />
                <Field
                  label="Atlas invoice no."
                  value={ful.supplier_invoice_ref}
                  onChange={(v) => setFul({ ...ful, supplier_invoice_ref: v })}
                />
                <Field
                  label="Ordered from Atlas on"
                  type="date"
                  value={ful.ordered_with_supplier_at}
                  onChange={(v) => setFul({ ...ful, ordered_with_supplier_at: v })}
                />
                <Field
                  label="Courier"
                  value={ful.courier}
                  onChange={(v) => setFul({ ...ful, courier: v })}
                />
                <Field
                  label="Tracking number"
                  value={ful.tracking_number}
                  onChange={(v) => setFul({ ...ful, tracking_number: v })}
                />
              </div>
              <Button
                className="mt-3"
                size="sm"
                variant="outline"
                disabled={saveFulfilment.isPending}
                onClick={() => saveFulfilment.mutate()}
              >
                Save Atlas details
              </Button>
              <p className="mt-2 text-xs text-muted-foreground">
                The tracking number is included in the "on its way" email.
              </p>

              {isAdmin && (
                <div className="mt-5">
                  <h4 className="text-sm font-semibold">Cost and margin (admin only)</h4>
                  <table className="mt-2 w-full text-sm">
                    <thead className="text-left text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="py-1">Product</th>
                        <th className="py-1 text-right">Sale ex VAT</th>
                        <th className="py-1 text-right">Expected cost</th>
                        <th className="py-1 text-right">Actual cost</th>
                        <th className="py-1 text-right">Margin</th>
                      </tr>
                    </thead>
                    <tbody>
                      {marginRows.map(({ item, cost, unitSaleEx, margin }) => (
                        <tr key={item.id} className="border-t align-top">
                          <td className="py-2">
                            {item.name}
                            <span className="block text-xs text-muted-foreground">
                              × {item.quantity}
                            </span>
                          </td>
                          <td className="py-2 text-right">{formatZAR(unitSaleEx)}</td>
                          <td className="py-2 text-right">
                            {money(cost?.expected_unit_cost_ex_vat)}
                            {cost?.cost_source === "estimated_backfill" && (
                              <span className="block text-[10px] uppercase text-muted-foreground">
                                estimate
                              </span>
                            )}
                          </td>
                          <td className="py-2 text-right">
                            <div className="flex justify-end gap-1">
                              <Input
                                className="h-8 w-24 text-right"
                                inputMode="decimal"
                                placeholder="ex VAT"
                                value={actualCosts[item.id] ?? ""}
                                onChange={(e) =>
                                  setActualCosts({ ...actualCosts, [item.id]: e.target.value })
                                }
                                disabled={!cost}
                              />
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={!cost || saveCost.isPending}
                                onClick={() => saveCost.mutate(item.id)}
                              >
                                Save
                              </Button>
                            </div>
                          </td>
                          <td
                            className={`py-2 text-right ${margin !== null && margin < 0 ? "text-destructive" : ""}`}
                          >
                            {margin === null ? "—" : formatZAR(margin)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mt-2 text-sm">
                    Gross margin on items:{" "}
                    <strong>{knownMargins.length ? formatZAR(totalMargin) : "—"}</strong>
                    {knownMargins.length > 0 && totalSaleEx > 0 && (
                      <span className="text-muted-foreground">
                        {" "}
                        ({Math.round((totalMargin / totalSaleEx) * 100)}% of sales ex VAT)
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Before delivery and payment costs. Provisional: it assumes VAT-exclusive costs
                    and sales, which depends on whether the business is VAT-registered.
                  </p>
                </div>
              )}
            </Section>

            {/* notes */}
            <Section title="Internal notes">
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                maxLength={4000}
                placeholder="Only staff can see this."
              />
              <Button
                className="mt-2"
                size="sm"
                variant="outline"
                disabled={saveNotes.isPending || notes === (o.admin_notes ?? "")}
                onClick={() => saveNotes.mutate()}
              >
                Save notes
              </Button>
            </Section>

            {/* history */}
            <Section title="Timeline">
              <ol className="space-y-2 text-sm">
                {history.map((h) => (
                  <li key={h.id} className="border-l-2 pl-3">
                    <span className="font-medium">{ORDER_STATUS_LABELS[h.status] ?? h.status}</span>
                    <span className="text-muted-foreground">
                      {" "}
                      · {new Date(h.created_at).toLocaleString("en-ZA")}
                    </span>
                    {h.note && <span className="block text-muted-foreground">{h.note}</span>}
                  </li>
                ))}
                {history.length === 0 && (
                  <li className="text-muted-foreground">No status changes yet.</li>
                )}
              </ol>
            </Section>
          </>
        )}

        {/* confirm a status change */}
        <Dialog open={!!pendingStatus} onOpenChange={(open) => !open && setPendingStatus(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                Move order to "{pendingStatus ? ORDER_STATUS_LABELS[pendingStatus] : ""}"?
              </DialogTitle>
              <DialogDescription>
                {pendingStatus === "cancelled"
                  ? "Cancelling cannot be undone. The customer is emailed."
                  : "The customer is emailed about this update."}
              </DialogDescription>
            </DialogHeader>
            <Textarea
              value={statusNote}
              onChange={(e) => setStatusNote(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="Note for the timeline (optional)"
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setPendingStatus(null)}>
                Back
              </Button>
              <Button
                variant={pendingStatus === "cancelled" ? "destructive" : "default"}
                disabled={changeStatus.isPending}
                onClick={() => changeStatus.mutate()}
              >
                Confirm
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* record payment */}
        <Dialog open={payOpen} onOpenChange={setPayOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Record payment for {o?.order_number}</DialogTitle>
              <DialogDescription>
                Copy the amount and reference from the bank statement. Order total:{" "}
                {money(o?.total_incl_vat)}.
              </DialogDescription>
            </DialogHeader>
            <Field
              label="Amount received (R)"
              value={payAmount}
              onChange={setPayAmount}
              inputMode="decimal"
            />
            <Field label="Bank reference" value={payRef} onChange={setPayRef} maxLength={60} />
            <DialogFooter>
              <Button
                disabled={recordPayment.isPending || payRef.trim().length < 3 || !payAmount.trim()}
                onClick={() => recordPayment.mutate()}
              >
                Record payment
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* record refund */}
        <Dialog open={refundOpen} onOpenChange={setRefundOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Record refund for {o?.order_number}</DialogTitle>
              <DialogDescription>
                Record a refund you have already paid back. A full refund (
                {money(o?.total_incl_vat)}) marks the order refunded and emails the customer.
              </DialogDescription>
            </DialogHeader>
            <Field
              label="Amount refunded (R)"
              value={refundAmount}
              onChange={setRefundAmount}
              inputMode="decimal"
            />
            <Field
              label="Refund reference"
              value={refundRef}
              onChange={setRefundRef}
              maxLength={60}
            />
            <Textarea
              value={refundNote}
              onChange={(e) => setRefundNote(e.target.value)}
              maxLength={300}
              rows={2}
              placeholder="Reason (optional)"
            />
            <DialogFooter>
              <Button
                variant="destructive"
                disabled={
                  recordRefund.isPending || refundRef.trim().length < 3 || !refundAmount.trim()
                }
                onClick={() => recordRefund.mutate()}
              >
                Record refund
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </SheetContent>
    </Sheet>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h3 className="font-display text-base font-semibold">{title}</h3>
      <Separator className="my-2" />
      {children}
    </section>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between ${strong ? "font-semibold" : ""}`}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  inputMode,
  maxLength = 120,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  inputMode?: "decimal" | "text";
  maxLength?: number;
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input
        className="mt-1"
        type={type}
        inputMode={inputMode}
        value={value}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
