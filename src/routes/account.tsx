import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { formatDate, formatZAR, ORDER_STATUS_LABELS } from "@/lib/format";

export const Route = createFileRoute("/account")({
  head: () => ({
    meta: [
      { title: "My Account | TechNest" },
      { name: "description", content: "View your TechNest orders, order status and wishlist." },
      { property: "og:title", content: "My Account | TechNest" },
      { property: "og:description", content: "View your TechNest orders and wishlist." },
    ],
  }),
  component: AccountPage,
});

function AccountPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  const orders = useQuery({
    queryKey: ["my-orders", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_number, status, total_incl_vat, created_at, order_items(name, quantity)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const wishlist = useQuery({
    queryKey: ["wishlist", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wishlist_items")
        .select("id, products(name, slug, selling_price_incl_vat)");
      if (error) throw error;
      return data;
    },
  });

  if (loading) return <Skeleton className="mx-auto my-16 h-64 max-w-4xl" />;

  if (!user) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 text-center">
        <h1 className="font-display text-3xl font-bold">Sign in to view your account</h1>
        <Button asChild className="mt-6">
          <Link to="/auth">Sign in or register</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold">My account</h1>
          <p className="text-muted-foreground">{user.email}</p>
        </div>
        <Button
          variant="outline"
          onClick={async () => {
            await supabase.auth.signOut();
            toast.success("Signed out");
            navigate({ to: "/" });
          }}
        >
          Sign out
        </Button>
      </div>

      <h2 className="mt-10 font-display text-xl font-semibold">Orders</h2>
      <div className="mt-4 space-y-4">
        {orders.isLoading && <Skeleton className="h-24 w-full" />}
        {(orders.data ?? []).length === 0 && !orders.isLoading && (
          <Card className="p-6 text-sm text-muted-foreground">
            You haven't placed any orders yet.{" "}
            <Link to="/shop" className="text-primary hover:underline">
              Start shopping
            </Link>
            .
          </Card>
        )}
        {(orders.data ?? []).map((o) => (
          <Card key={o.id} className="p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-display font-semibold">{o.order_number}</p>
                <p className="text-sm text-muted-foreground">{formatDate(o.created_at)}</p>
              </div>
              <Badge className="border-0 bg-accent text-accent-foreground">
                {ORDER_STATUS_LABELS[o.status] ?? o.status}
              </Badge>
            </div>
            <Separator className="my-4" />
            <ul className="space-y-1 text-sm text-muted-foreground">
              {(o.order_items ?? []).map((i, idx) => (
                <li key={idx}>
                  {i.quantity} × {i.name}
                </li>
              ))}
            </ul>
            <Separator className="my-4" />
            <div className="space-y-1 text-sm text-muted-foreground">
              <p>
                {o.delivery_method === "collection"
                  ? `Collection${o.delivery_estimate ? ` · ${o.delivery_estimate}` : ""}`
                  : `Delivery${o.delivery_zone_name ? ` · ${o.delivery_zone_name}` : ""}${
                      o.delivery_estimate ? ` · ${o.delivery_estimate}` : ""
                    }`}
              </p>
              <p>
                {o.delivery_method === "collection" || Number(o.delivery_fee) === 0
                  ? "No delivery fee"
                  : `Delivery fee ${formatZAR(Number(o.delivery_fee))}`}
              </p>
            </div>
            <p className="mt-4 font-display font-bold">{formatZAR(Number(o.total_incl_vat))}</p>
          </Card>
        ))}
      </div>

      <h2 className="mt-10 font-display text-xl font-semibold">Wishlist</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {(wishlist.data ?? []).length === 0 && (
          <Card className="p-6 text-sm text-muted-foreground">Your wishlist is empty.</Card>
        )}
        {(wishlist.data ?? []).map((w) => (
          <Card key={w.id} className="flex items-center justify-between p-4">
            <Link
              to="/product/$slug"
              params={{ slug: w.products?.slug ?? "" }}
              className="font-medium hover:text-primary"
            >
              {w.products?.name}
            </Link>
            <span className="text-sm">{formatZAR(Number(w.products?.selling_price_incl_vat ?? 0))}</span>
          </Card>
        ))}
      </div>
    </div>
  );
}
