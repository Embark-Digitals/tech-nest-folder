import { useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { track, itemPayload } from "@/lib/analytics";
import { canonicalHead, noindexMeta } from "@/lib/site";
import { Minus, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useCart } from "@/lib/cart";
import { formatZAR, VAT_RATE } from "@/lib/format";

export const Route = createFileRoute("/cart")({
  head: () => ({
    meta: [
      { title: "Your Cart | TechNest" },
      { name: "description", content: "Review the tech in your TechNest cart before checkout. Prices in ZAR incl. VAT." },
      { property: "og:title", content: "Your Cart | TechNest" },
      { property: "og:description", content: "Review your TechNest cart before checkout." },
      // Private, per-visitor page: excluded from the sitemap and from indexing.
      noindexMeta,
      canonicalHead("/cart").meta,
    ],
  }),
  component: CartPage,
});

function CartPage() {
  const cart = useCart();
  const exVat = cart.totalInclVat / (1 + VAT_RATE);

  useEffect(() => {
    if (cart.lines.length === 0) return;
    track("view_cart", { value: cart.totalInclVat, items: cart.lines.map(itemPayload) });
    // Only the initial view of a non-empty cart is reported.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);



  if (cart.lines.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 text-center">
        <h1 className="font-display text-3xl font-bold">Your cart is empty</h1>
        <p className="mt-2 text-muted-foreground">Add some tech to get started.</p>
        <Button asChild className="mt-6">
          <Link to="/shop">Shop products</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <h1 className="font-display text-3xl font-bold">Your cart</h1>
      <div className="mt-8 grid gap-8 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {cart.lines.map((line) => (
            <Card key={line.productId} className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
              <div className="h-24 w-24 shrink-0 overflow-hidden rounded-lg bg-muted">
                {line.image && <img src={line.image} alt={line.name} className="h-full w-full object-cover" />}
              </div>
              <div className="flex-1">
                <Link to="/product/$slug" params={{ slug: line.slug }} className="font-semibold hover:text-primary">
                  {line.name}
                </Link>
                <p className="text-sm text-muted-foreground">SKU {line.sku}</p>
                <p className="mt-1 font-display font-bold">{formatZAR(line.price)}</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center rounded-md border">
                  <Button variant="ghost" size="icon" onClick={() => cart.setQuantity(line.productId, line.quantity - 1)}>
                    <Minus className="h-4 w-4" />
                  </Button>
                  <span className="w-8 text-center text-sm">{line.quantity}</span>
                  <Button variant="ghost" size="icon" onClick={() => cart.setQuantity(line.productId, line.quantity + 1)}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    track("remove_from_cart", {
                      value: line.price * line.quantity,
                      items: [itemPayload(line)],
                    });
                    cart.remove(line.productId);
                  }}
                  aria-label="Remove"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>

        <Card className="h-fit p-6">
          <h2 className="font-display text-lg font-semibold">Order summary</h2>
          <Separator className="my-4" />
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Subtotal (excl. VAT)</dt>
              <dd>{formatZAR(exVat)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">VAT (15%)</dt>
              <dd>{formatZAR(cart.totalInclVat - exVat)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Delivery</dt>
              <dd>Quoted after confirmation</dd>
            </div>
          </dl>
          <Separator className="my-4" />
          <div className="flex justify-between font-display text-lg font-bold">
            <span>Total</span>
            <span>{formatZAR(cart.totalInclVat)}</span>
          </div>
          <Button asChild size="lg" className="mt-6 w-full">
            <Link to="/checkout">Proceed to checkout</Link>
          </Button>
          <Button asChild variant="ghost" className="mt-2 w-full">
            <Link to="/shop">Continue shopping</Link>
          </Button>
        </Card>
      </div>
    </div>
  );
}
