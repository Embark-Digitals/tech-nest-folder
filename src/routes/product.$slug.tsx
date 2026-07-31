import { canonicalHead } from "@/lib/site";
import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Heart, Minus, Plus, ShoppingCart, Truck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { StockBadge } from "@/components/site/StockBadge";
import { ProductCard } from "@/components/site/ProductCard";
import { JsonLd } from "@/components/site/JsonLd";
import { track, itemPayload } from "@/lib/analytics";
import { formatZAR, VAT_RATE } from "@/lib/format";
import { primaryImage, productQuery, productsQuery } from "@/lib/catalogue";
import { useCart } from "@/lib/cart";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/product/$slug")({
  head: ({ params }) => {
    const name = params.slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    const canonical = canonicalHead(`/product/${params.slug}`);
    return {
      meta: [
        { title: `${name} | TechNest South Africa` },
        {
          name: "description",
          content: `Buy the ${name} at TechNest. ZAR price incl. 15% VAT, live stock status and delivery across Gauteng.`,
        },
        { property: "og:title", content: `${name} | TechNest` },
        { property: "og:description", content: `Buy the ${name} at TechNest — ZAR price incl. VAT.` },
        { property: "og:type", content: "product" },
        canonical.meta,
      ],
      links: [canonical.link],
    };
  },

  component: ProductPage,
});

function ProductPage() {
  const { slug } = Route.useParams();
  const { data: product, isLoading } = useQuery(productQuery(slug));
  const { data: related } = useQuery(productsQuery({ category: product?.categories?.slug }));
  const cart = useCart();
  const { user } = useAuth();
  const [qty, setQty] = useState(1);

  useEffect(() => {
    if (!product) return;
    track("view_item", {
      value: product.selling_price_incl_vat ?? 0,
      items: [
        itemPayload({
          sku: product.sku,
          name: product.name,
          price: product.selling_price_incl_vat ?? 0,
        }),
      ],
    });
  }, [product?.id]);



  if (isLoading) {
    return (
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 lg:grid-cols-2">
        <Skeleton className="aspect-square w-full" />
        <div className="space-y-4">
          <Skeleton className="h-10 w-3/4" />
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 text-center">
        <h1 className="font-display text-2xl font-bold">Product not found</h1>
        <Button asChild className="mt-6">
          <Link to="/shop">Back to shop</Link>
        </Button>
      </div>
    );
  }

  const image = primaryImage(product);
  const price = product.selling_price_incl_vat ?? 0;
  const exVat = price / (1 + VAT_RATE);
  const buyable = price > 0 && product.stock_status !== "out_of_stock";

  const addToWishlist = async () => {
    if (!user) {
      toast.error("Sign in to save items to your wishlist");
      return;
    }
    const { error } = await supabase
      .from("wishlist_items")
      .insert({ user_id: user.id, product_id: product.id });
    if (error) toast.error("Could not save to wishlist");
    else toast.success("Saved to wishlist");
  };

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const productLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    sku: product.sku,
    description: product.short_description ?? product.full_description ?? product.name,
    ...(image ? { image: [image] } : {}),
    ...(product.brands?.name ? { brand: { "@type": "Brand", name: product.brands.name } } : {}),
    offers: {
      "@type": "Offer",
      priceCurrency: "ZAR",
      price: price.toFixed(2),
      availability: buyable
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      url: `${origin}/product/${product.slug}`,
      seller: { "@type": "Organization", name: "TechNest" },
    },
  };
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${origin}/` },
      ...(product.categories
        ? [
            {
              "@type": "ListItem",
              position: 2,
              name: product.categories.name,
              item: `${origin}/category/${product.categories.slug}`,
            },
          ]
        : []),
      { "@type": "ListItem", position: product.categories ? 3 : 2, name: product.name },
    ],
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <JsonLd data={productLd} />
      <JsonLd data={breadcrumbLd} />

      <nav className="text-sm text-muted-foreground">
        <Link to="/" className="hover:text-primary">
          Home
        </Link>{" "}
        /{" "}
        {product.categories && (
          <>
            <Link
              to="/category/$slug"
              params={{ slug: product.categories.slug }}
              className="hover:text-primary"
            >
              {product.categories.name}
            </Link>{" "}
            /{" "}
          </>
        )}
        <span className="text-foreground">{product.name}</span>
      </nav>

      <div className="mt-6 grid gap-10 lg:grid-cols-2">
        <div className="overflow-hidden rounded-xl border bg-muted">
          {image ? (
            <img src={image} alt={product.name} className="aspect-square w-full object-cover" />
          ) : (
            <div className="flex aspect-square items-center justify-center text-muted-foreground">
              No image available
            </div>
          )}
        </div>

        <div>
          <p className="text-sm uppercase tracking-wide text-muted-foreground">
            {product.brands?.name ?? "TechNest"} · SKU {product.sku}
          </p>
          <h1 className="mt-2 font-display text-3xl font-bold">{product.name}</h1>
          <div className="mt-3">
            <StockBadge status={product.stock_status} quantity={product.quantity} />
          </div>

          <p className="mt-6 font-display text-4xl font-bold">{formatZAR(price)}</p>
          <p className="text-sm text-muted-foreground">
            {formatZAR(exVat)} excl. VAT · 15% VAT {formatZAR(price - exVat)}
          </p>

          {product.short_description && (
            <p className="mt-4 text-muted-foreground">{product.short_description}</p>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <div className="flex items-center rounded-md border">
              <Button variant="ghost" size="icon" onClick={() => setQty((q) => Math.max(1, q - 1))}>
                <Minus className="h-4 w-4" />
              </Button>
              <span className="w-10 text-center text-sm font-medium">{qty}</span>
              <Button variant="ghost" size="icon" onClick={() => setQty((q) => q + 1)}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <Button
              size="lg"
              disabled={!buyable}
              onClick={() => {
                cart.add(
                  {
                    productId: product.id,
                    sku: product.sku,
                    name: product.name,
                    slug: product.slug,
                    price,
                    image,
                  },
                  qty,
                );
                track("add_to_cart", {
                  value: price * qty,
                  items: [itemPayload({ sku: product.sku, name: product.name, price, quantity: qty })],
                });
                toast.success(`${product.name} added to cart`);

              }}
            >
              <ShoppingCart className="mr-2 h-4 w-4" />
              {buyable ? "Add to cart" : "Unavailable"}
            </Button>
            <Button size="lg" variant="outline" onClick={addToWishlist}>
              <Heart className="mr-2 h-4 w-4" /> Wishlist
            </Button>
          </div>

          <Card className="mt-6 flex items-start gap-3 p-4">
            <Truck className="mt-0.5 h-5 w-5 text-primary" />
            <p className="text-sm text-muted-foreground">
              Delivery within Gauteng, calculated at checkout from your postal code. Collection available.
            </p>
          </Card>

          <Separator className="my-8" />

          <h2 className="font-display text-lg font-semibold">Description</h2>
          <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">
            {product.full_description ?? product.short_description ?? "No description available."}
          </p>

          <h2 className="mt-8 font-display text-lg font-semibold">Specifications</h2>
          <dl className="mt-2 divide-y rounded-lg border text-sm">
            {[
              ["Brand", product.brands?.name],
              ["SKU", product.sku],
              ["Screen size", product.screen_size],
              ["Capacity", product.capacity],
              ["Colour", product.colour],
              ...(product.product_specifications ?? []).map((s) => [s.spec_key, s.spec_value]),
            ]
              .filter(([, v]) => Boolean(v))
              .map(([k, v]) => (
                <div key={String(k)} className="flex justify-between gap-4 px-4 py-2">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="font-medium">{v}</dd>
                </div>
              ))}
          </dl>
        </div>
      </div>

      <section className="mt-16">
        <h2 className="font-display text-2xl font-bold">Related products</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {(related ?? [])
            .filter((p) => p.id !== product.id)
            .slice(0, 4)
            .map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
        </div>
      </section>
    </div>
  );
}
