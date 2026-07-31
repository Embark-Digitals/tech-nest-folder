import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { toast } from "sonner";
import { Truck, Store, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCart } from "@/lib/cart";
import { formatZAR, VAT_RATE } from "@/lib/format";
import { useAuth } from "@/hooks/use-auth";
import { useServerFn } from "@tanstack/react-start";
import { placeOrder } from "@/lib/orders.functions";
import { supabase } from "@/integrations/supabase/client";
import {
  deliveryQuoteQuery,
  provincesQuery,
  shippingSettingsQuery,
  type DeliveryMethod,
} from "@/lib/shipping";

const schema = z.object({
  contact_name: z.string().trim().min(2, "Enter your full name").max(100),
  contact_email: z.string().trim().email("Enter a valid email").max(255),
  contact_phone: z.string().trim().min(8, "Enter a contact number").max(20),
  line1: z.string().trim().min(3, "Enter a street address").max(200),
  suburb: z.string().trim().max(100).optional(),
  city: z.string().trim().min(2, "Enter a city").max(100),
  postal_code: z.string().trim().regex(/^\d{4}$/, "Enter a 4 digit postal code"),
  customer_notes: z.string().trim().max(1000).optional(),
});

export const Route = createFileRoute("/checkout")({
  head: () => ({
    meta: [
      { title: "Checkout | TechNest" },
      {
        name: "description",
        content: "Complete your TechNest order. Gauteng delivery and collection, all prices in ZAR incl. VAT.",
      },
      { property: "og:title", content: "Checkout | TechNest" },
      { property: "og:description", content: "Complete your TechNest order — Gauteng delivery or collection." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Checkout,
});

function Checkout() {
  const cart = useCart();
  const { user, loading } = useAuth();
  const { data: shipping } = useQuery(shippingSettingsQuery);
  const { data: provinces } = useQuery(provincesQuery);
  const navigate = useNavigate();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [method, setMethod] = useState<DeliveryMethod>("courier");
  const [province, setProvince] = useState("");
  const [city, setCity] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [enquirySent, setEnquirySent] = useState(false);
  const [enquiring, setEnquiring] = useState(false);
  const submissionKey = useRef<string | null>(null);
  const submitOrder = useServerFn(placeOrder);

  const items = useMemo(
    () => cart.lines.map((l) => ({ product_id: l.productId, quantity: l.quantity })),
    [cart.lines],
  );

  const [debounced, setDebounced] = useState({ province: "", city: "", postalCode: "" });
  useEffect(() => {
    const t = setTimeout(() => setDebounced({ province, city, postalCode }), 350);
    return () => clearTimeout(t);
  }, [province, city, postalCode]);

  const quoteReady =
    items.length > 0 &&
    (method === "collection" || (!!debounced.province && /^\d{4}$/.test(debounced.postalCode)));

  const { data: quote, isFetching: quoting } = useQuery(
    deliveryQuoteQuery({ ...debounced, method, items }, quoteReady),
  );

  const deliveryFee = quote?.eligible ? Number(quote.delivery_fee ?? 0) : 0;
  const total = cart.totalInclVat + deliveryFee;
  const exVat = total / (1 + VAT_RATE);
  const canSubmit = !!quote?.eligible && !submitting;

  if (!loading && !user) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 text-center">
        <h1 className="font-display text-3xl font-bold">Sign in to check out</h1>
        <p className="mt-2 text-muted-foreground">
          Create an account or sign in so we can track your order and keep you updated.
        </p>
        <Button asChild className="mt-6">
          <Link to="/auth">Sign in or register</Link>
        </Button>
      </div>
    );
  }

  if (cart.lines.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 text-center">
        <h1 className="font-display text-3xl font-bold">Nothing to check out</h1>
        <Button asChild className="mt-6">
          <Link to="/shop">Shop products</Link>
        </Button>
      </div>
    );
  }

  const sendEnquiry = async (form: HTMLFormElement) => {
    const fd = new FormData(form);
    setEnquiring(true);
    const { error } = await supabase.from("delivery_enquiries").insert({
      user_id: user!.id,
      contact_name: String(fd.get("contact_name") ?? "").trim() || (user!.email ?? "Customer"),
      contact_email: String(fd.get("contact_email") ?? "").trim() || (user!.email ?? ""),
      contact_phone: String(fd.get("contact_phone") ?? "").trim() || null,
      province,
      city,
      postal_code: postalCode,
      address_line1: String(fd.get("line1") ?? "").trim() || null,
      items,
      estimated_subtotal_incl_vat: cart.totalInclVat,
      message: String(fd.get("customer_notes") ?? "").trim() || null,
    });
    setEnquiring(false);
    if (error) {
      toast.error("We couldn't send your enquiry. Please try again.");
      return;
    }
    setEnquirySent(true);
    toast.success("Delivery enquiry sent — our team will quote you directly. No order was placed.");
  };

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting) return;
    const form = e.currentTarget;
    const fd = new FormData(form);
    const entries = Object.fromEntries(fd);
    const isCollection = method === "collection";
    // Collection orders have no delivery address, so the address fields are
    // dropped entirely rather than submitted as empty strings.
    const payload = isCollection
      ? {
          contact_name: entries["contact_name"],
          contact_email: entries["contact_email"],
          contact_phone: entries["contact_phone"],
          customer_notes: entries["customer_notes"],
        }
      : { ...entries, city, postal_code: postalCode };
    const parsed = (isCollection
      ? schema.partial({ line1: true, city: true, postal_code: true })
      : schema
    ).safeParse(payload);
    if (!parsed.success) {
      const map: Record<string, string> = {};
      parsed.error.issues.forEach((i) => (map[String(i.path[0])] = i.message));
      setErrors(map);
      return;
    }
    if (method === "courier" && !province) {
      setErrors({ province: "Select a province" });
      return;
    }
    if (!quote?.eligible) return;
    setErrors({});
    setSubmitting(true);
    const v = parsed.data;

    if (!submissionKey.current) {
      submissionKey.current =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `sk-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }

    try {
      // Only ids, quantities and the address are sent. Pricing and the
      // delivery fee are recalculated server-side.
      const result = await submitOrder({
        data: {
          items,
          contact_name: v.contact_name!,
          contact_email: v.contact_email!,
          contact_phone: v.contact_phone!,
          delivery_method: method,
          delivery_address:
            method === "collection"
              ? null
              : {
                  line1: v.line1!,
                  suburb: v.suburb ?? null,
                  city,
                  province,
                  postal_code: postalCode,
                },
          customer_notes: v.customer_notes ?? null,
          idempotency_key: submissionKey.current,
        },
      });

      if (!result.ok) {
        setSubmitting(false);
        toast.error(result.error || "We couldn't place your order. Please try again.");
        return;
      }

      cart.clear();
      toast.success(
        `Order ${result.order.order_number} received — ${
          result.order.delivery_method === "collection" ? "collection" : "delivery"
        } total ${formatZAR(Number(result.order.total_incl_vat))}`,
      );
      navigate({ to: "/account" });
    } catch (err) {
      console.error(err);
      setSubmitting(false);
      toast.error("We couldn't place your order. Please try again.");
    }
  };

  const field = (name: string, label: string, extra?: Partial<React.ComponentProps<typeof Input>>) => (
    <div>
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} className="mt-1" {...extra} />
      {errors[name] && <p className="mt-1 text-xs text-destructive">{errors[name]}</p>}
    </div>
  );

  const blocked = quoteReady && quote && !quote.eligible;

  return (
    <form
      onSubmit={onSubmit}
      className="mx-auto max-w-7xl px-4 py-10"
      id="checkout-form"
    >
      <h1 className="font-display text-3xl font-bold">Checkout</h1>
      <div className="mt-8 grid gap-8 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="space-y-4 p-6">
            <h2 className="font-display text-lg font-semibold">Contact details</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {field("contact_name", "Full name", { defaultValue: user?.user_metadata?.full_name ?? "" })}
              {field("contact_email", "Email", { type: "email", defaultValue: user?.email ?? "" })}
              {field("contact_phone", "Phone number", { type: "tel" })}
            </div>
          </Card>

          <Card className="space-y-4 p-6">
            <h2 className="font-display text-lg font-semibold">Delivery method</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setMethod("courier")}
                className={`flex items-start gap-3 rounded-lg border p-4 text-left transition ${
                  method === "courier" ? "border-primary bg-primary/5" : "border-border"
                }`}
              >
                <Truck className="mt-0.5 size-5 text-primary" />
                <span>
                  <span className="block font-medium">Gauteng delivery</span>
                  <span className="block text-xs text-muted-foreground">
                    Courier delivery within our active Gauteng zones.
                  </span>
                </span>
              </button>
              <button
                type="button"
                disabled={!shipping?.collection_enabled}
                onClick={() => setMethod("collection")}
                className={`flex items-start gap-3 rounded-lg border p-4 text-left transition disabled:opacity-50 ${
                  method === "collection" ? "border-primary bg-primary/5" : "border-border"
                }`}
              >
                <Store className="mt-0.5 size-5 text-primary" />
                <span>
                  <span className="block font-medium">Collection</span>
                  <span className="block text-xs text-muted-foreground">
                    {shipping?.collection_enabled ? "No delivery fee." : "Currently unavailable."}
                  </span>
                </span>
              </button>
            </div>
            {method === "collection" && (
              <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm">
                <p className="font-medium">{shipping?.collection_address}</p>
                <p className="mt-1 text-muted-foreground">{shipping?.collection_instructions}</p>
              </div>
            )}
          </Card>

          {method === "courier" && (
            <Card className="space-y-4 p-6">
              <h2 className="font-display text-lg font-semibold">Delivery address</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {field("line1", "Street address")}
                {field("suburb", "Suburb")}
                <div>
                  <Label htmlFor="city">City / municipality</Label>
                  <Input
                    id="city"
                    className="mt-1"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                  />
                  {errors["city"] && <p className="mt-1 text-xs text-destructive">{errors["city"]}</p>}
                </div>
                <div>
                  <Label htmlFor="province">Province</Label>
                  <Select value={province} onValueChange={setProvince}>
                    <SelectTrigger id="province" className="mt-1">
                      <SelectValue placeholder="Select a province" />
                    </SelectTrigger>
                    <SelectContent>
                      {(provinces ?? []).map((p) => (
                        <SelectItem key={p.code} value={p.code}>
                          {p.name}
                          {!p.is_active ? " — not yet serviced" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors["province"] && (
                    <p className="mt-1 text-xs text-destructive">{errors["province"]}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="postal_code">Postal code</Label>
                  <Input
                    id="postal_code"
                    inputMode="numeric"
                    maxLength={4}
                    className="mt-1"
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  />
                  {errors["postal_code"] && (
                    <p className="mt-1 text-xs text-destructive">{errors["postal_code"]}</p>
                  )}
                </div>
              </div>
            </Card>
          )}

          {blocked && (
            <Card className="space-y-3 border-destructive/40 p-6">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 size-5 text-destructive" />
                <div>
                  <h2 className="font-display text-lg font-semibold">Delivery not available</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{quote?.message}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                {quote?.collection_available && (
                  <Button type="button" variant="secondary" onClick={() => setMethod("collection")}>
                    Switch to collection
                  </Button>
                )}
                {quote?.manual_quote_available && !enquirySent && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={enquiring}
                    onClick={() => sendEnquiry(document.getElementById("checkout-form") as HTMLFormElement)}
                  >
                    {enquiring ? "Sending…" : "Send a delivery enquiry"}
                  </Button>
                )}
                {enquirySent && (
                  <Badge variant="secondary">Enquiry sent — this is not a confirmed order</Badge>
                )}
              </div>
            </Card>
          )}

          <Card className="space-y-3 p-6">
            <h2 className="font-display text-lg font-semibold">Order notes</h2>
            <Textarea name="customer_notes" maxLength={1000} placeholder="Anything we should know?" />
          </Card>
        </div>

        <Card className="h-fit p-6">
          <h2 className="font-display text-lg font-semibold">Order summary</h2>
          <Separator className="my-4" />
          <ul className="space-y-2 text-sm">
            {cart.lines.map((l) => (
              <li key={l.productId} className="flex justify-between gap-4">
                <span className="text-muted-foreground">
                  {l.quantity} × {l.name}
                </span>
                <span>{formatZAR(l.price * l.quantity)}</span>
              </li>
            ))}
          </ul>
          <Separator className="my-4" />
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Items</span>
            <span>{formatZAR(cart.totalInclVat)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">
              {method === "collection" ? "Collection" : "Delivery"}
            </span>
            <span>
              {!quoteReady
                ? "—"
                : quoting
                  ? "Calculating…"
                  : quote?.eligible
                    ? deliveryFee === 0
                      ? "Free"
                      : formatZAR(deliveryFee)
                    : "Unavailable"}
            </span>
          </div>
          {quote?.eligible && (quote.surcharges?.length ?? 0) > 0 && (
            <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
              {quote.surcharges!.map((s) => (
                <li key={s.label} className="flex justify-between">
                  <span>incl. {s.label}</span>
                  <span>{formatZAR(Number(s.amount))}</span>
                </li>
              ))}
            </ul>
          )}
          {quote?.eligible && quote.zone_name && (
            <p className="mt-2 text-xs text-muted-foreground">
              {quote.zone_name}
              {quote.estimate ? ` · ${quote.estimate}` : ""}
              {quote.free_delivery_applied ? " · free delivery threshold reached" : ""}
            </p>
          )}
          <Separator className="my-4" />
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Total excl. VAT</span>
            <span>{formatZAR(exVat)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">VAT (15%)</span>
            <span>{formatZAR(total - exVat)}</span>
          </div>
          <Separator className="my-4" />
          <div className="flex justify-between font-display text-lg font-bold">
            <span>Total</span>
            <span>{formatZAR(total)}</span>
          </div>
          <Button type="submit" size="lg" className="mt-6 w-full" disabled={!canSubmit}>
            {submitting
              ? "Placing order…"
              : quote?.eligible
                ? "Place order"
                : method === "collection"
                  ? "Collection unavailable"
                  : "Enter a serviced Gauteng address"}
          </Button>
          <p className="mt-3 text-xs text-muted-foreground">
            Prices and the delivery fee are re-checked on our server when the order is placed. TechNest
            currently delivers within Gauteng only.
          </p>
        </Card>
      </div>
    </form>
  );
}
