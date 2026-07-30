import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { useCart } from "@/lib/cart";
import { formatZAR, VAT_RATE } from "@/lib/format";
import { useAuth } from "@/hooks/use-auth";
import { siteSettingsQuery } from "@/lib/catalogue";
import { supabase } from "@/integrations/supabase/client";

const schema = z.object({
  contact_name: z.string().trim().min(2, "Enter your full name").max(100),
  contact_email: z.string().trim().email("Enter a valid email").max(255),
  contact_phone: z.string().trim().min(8, "Enter a contact number").max(20),
  line1: z.string().trim().min(3, "Enter a street address").max(200),
  suburb: z.string().trim().max(100).optional(),
  city: z.string().trim().min(2, "Enter a city").max(100),
  province: z.string().trim().min(2, "Enter a province").max(100),
  postal_code: z.string().trim().min(4, "Enter a postal code").max(10),
  customer_notes: z.string().trim().max(1000).optional(),
});

export const Route = createFileRoute("/checkout")({
  head: () => ({
    meta: [
      { title: "Checkout | TechNest" },
      { name: "description", content: "Complete your TechNest order. Delivery nationwide across South Africa." },
      { property: "og:title", content: "Checkout | TechNest" },
      { property: "og:description", content: "Complete your TechNest order." },
    ],
  }),
  component: Checkout,
});

function Checkout() {
  const cart = useCart();
  const { user, loading } = useAuth();
  const { data: settings } = useQuery(siteSettingsQuery);
  const navigate = useNavigate();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const exVat = cart.totalInclVat / (1 + VAT_RATE);

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

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const parsed = schema.safeParse(Object.fromEntries(form));
    if (!parsed.success) {
      const map: Record<string, string> = {};
      parsed.error.issues.forEach((i) => (map[String(i.path[0])] = i.message));
      setErrors(map);
      return;
    }
    setErrors({});
    setSubmitting(true);
    const v = parsed.data;

    const { data: order, error } = await supabase
      .from("orders")
      .insert({
        user_id: user!.id,
        contact_name: v.contact_name,
        contact_email: v.contact_email,
        contact_phone: v.contact_phone,
        delivery_address: {
          line1: v.line1,
          suburb: v.suburb ?? null,
          city: v.city,
          province: v.province,
          postal_code: v.postal_code,
          country: "South Africa",
        },
        delivery_method: "courier",
        subtotal_incl_vat: Number(cart.totalInclVat.toFixed(2)),
        vat_amount: Number((cart.totalInclVat - exVat).toFixed(2)),
        total_incl_vat: Number(cart.totalInclVat.toFixed(2)),
        payment_method: settings?.checkout_mode === "manual_eft" ? "eft" : "request",
        customer_notes: v.customer_notes ?? null,
        status: "new",
      })
      .select("id, order_number")
      .single();

    if (error || !order) {
      setSubmitting(false);
      toast.error("We couldn't place your order. Please try again.");
      return;
    }

    const { error: itemsError } = await supabase.from("order_items").insert(
      cart.lines.map((l) => ({
        order_id: order.id,
        product_id: l.productId,
        sku: l.sku,
        name: l.name,
        quantity: l.quantity,
        unit_price_incl_vat: l.price,
        line_total_incl_vat: Number((l.price * l.quantity).toFixed(2)),
      })),
    );

    setSubmitting(false);
    if (itemsError) {
      toast.error("Order created but items failed to save. Our team will be in touch.");
      return;
    }

    cart.clear();
    toast.success(`Order ${order.order_number} received`);
    navigate({ to: "/account" });
  };

  const field = (name: string, label: string, extra?: Partial<React.ComponentProps<typeof Input>>) => (
    <div>
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} className="mt-1" {...extra} />
      {errors[name] && <p className="mt-1 text-xs text-destructive">{errors[name]}</p>}
    </div>
  );

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-7xl px-4 py-10">
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
            <h2 className="font-display text-lg font-semibold">Delivery address</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {field("line1", "Street address")}
              {field("suburb", "Suburb")}
              {field("city", "City")}
              {field("province", "Province")}
              {field("postal_code", "Postal code")}
            </div>
            <p className="text-sm text-muted-foreground">
              {settings?.delivery_note ?? "Nationwide delivery available. Delivery is quoted after stock confirmation."}
            </p>
          </Card>

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
            <span className="text-muted-foreground">Subtotal excl. VAT</span>
            <span>{formatZAR(exVat)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">VAT (15%)</span>
            <span>{formatZAR(cart.totalInclVat - exVat)}</span>
          </div>
          <Separator className="my-4" />
          <div className="flex justify-between font-display text-lg font-bold">
            <span>Total</span>
            <span>{formatZAR(cart.totalInclVat)}</span>
          </div>
          <Button type="submit" size="lg" className="mt-6 w-full" disabled={submitting}>
            {submitting ? "Placing order…" : "Place order"}
          </Button>
          <p className="mt-3 text-xs text-muted-foreground">
            Our team confirms stock and delivery cost before payment is requested.
          </p>
        </Card>
      </div>
    </form>
  );
}
