import { createFileRoute, Link } from "@tanstack/react-router";
import { canonicalHead } from "@/lib/site";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ShieldCheck, Truck, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ProductCard } from "@/components/site/ProductCard";
import { categoriesQuery, productsQuery, primaryImage } from "@/lib/catalogue";
import { formatZAR } from "@/lib/format";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "TechNest | Buy Laptops, Phones & Gaming Gear in South Africa" },
      {
        name: "description",
        content:
          "Shop laptops, smartphones, audio and gaming tech at TechNest. Transparent ZAR pricing incl. VAT, live stock status and delivery across Gauteng.",
      },
      { property: "og:title", content: "TechNest | Buy Laptops, Phones & Gaming Gear in South Africa" },
      {
        property: "og:description",
        content: "Shop laptops, smartphones, audio and gaming tech at TechNest. Transparent ZAR pricing incl. VAT, live stock status and Gauteng delivery.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      canonicalHead("/").meta,
    ],
    links: [canonicalHead("/").link],
  }),
  component: Index,
});

function Index() {
  const { data: categories } = useQuery(categoriesQuery);
  const { data: products, isLoading } = useQuery(productsQuery({ sort: "new" }));

  const all = products ?? [];
  const featured = all.filter((p) => p.is_featured).slice(0, 10);
  const promos = all.filter((p) => p.is_promotional).slice(0, 5);
  const newArrivals = all.filter((p) => p.is_new_arrival).slice(0, 5);
  const hero = all.find((p) => primaryImage(p)) ?? all[0];
  const heroImage = hero ? primaryImage(hero) : null;
  const tiles = all.filter((p) => primaryImage(p) && p.id !== hero?.id).slice(0, 3);
  const grid = (featured.length ? featured : all).slice(0, 10);

  return (
    <div className="mx-auto max-w-7xl px-4">
      {/* Hero */}
      <section className="mt-6 bg-muted">
        <div className="grid items-center gap-8 px-6 py-12 sm:px-10 lg:grid-cols-2 lg:py-16">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Proudly South African</p>
            <h1 className="mt-2 font-display text-4xl font-bold leading-[1.05] sm:text-5xl">
              Technology,
              <br />
              priced in Rand.
            </h1>
            <p className="mt-4 max-w-md text-sm text-muted-foreground">
              Genuine laptops, appliances, audio and gaming gear — live stock status, VAT-inclusive pricing
              and Gauteng delivery.
            </p>
            <Button
              asChild
              className="mt-8 rounded-full px-8 text-xs uppercase tracking-[0.16em]"
              size="lg"
            >
              <Link to="/shop">Shop now</Link>
            </Button>
          </div>
          <div className="flex items-center justify-center">
            {heroImage ? (
              <img
                src={heroImage}
                alt={hero?.name ?? "Featured product"}
                className="max-h-80 w-full object-contain"
              />
            ) : (
              <Skeleton className="h-72 w-full" />
            )}
          </div>
        </div>
      </section>

      {/* Promo tiles */}
      <section className="mt-6 grid gap-6 md:grid-cols-3">
        {(tiles.length ? tiles : []).map((p, i) => {
          const tints = ["bg-accent", "bg-muted", "bg-secondary"];
          return (
            <Link
              key={p.id}
              to="/product/$slug"
              params={{ slug: p.slug }}
              className={`flex items-center gap-4 p-6 transition-opacity hover:opacity-90 ${tints[i % 3]}`}
            >
              <div className="min-w-0 flex-1">
                <p className="font-display text-lg font-bold text-primary">{p.brands?.name ?? "TechNest"}</p>
                <p className="line-clamp-2 font-display text-base font-semibold">{p.name}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Starting at{" "}
                  <span className="font-semibold text-primary">{formatZAR(p.selling_price_incl_vat)}</span>
                </p>
                <span className="mt-3 inline-flex h-7 w-7 items-center justify-center rounded-full border border-primary text-primary">
                  <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </div>
              <img src={primaryImage(p)!} alt={p.name} className="h-28 w-28 shrink-0 object-contain" />
            </Link>
          );
        })}
      </section>

      {/* Category strip */}
      <section className="py-14 text-center">
        <h2 className="section-heading font-display text-2xl font-bold">Shop by category</h2>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
          {(categories ?? []).slice(0, 12).map((c) => (
            <Link
              key={c.id}
              to="/category/$slug"
              params={{ slug: c.slug }}
              className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-primary"
            >
              {c.name}
            </Link>
          ))}
        </div>

        <div className="mt-10 grid gap-x-6 gap-y-10 text-left sm:grid-cols-2 lg:grid-cols-5">
          {isLoading
            ? Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-80 w-full" />)
            : grid.map((p) => <ProductCard key={p.id} product={p} />)}
        </div>
      </section>

      {/* Promotions & new arrivals */}
      {[
        { title: "On promotion", items: promos },
        { title: "New arrivals", items: newArrivals },
      ]
        .filter((s) => s.items.length > 0)
        .map((section) => (
          <section key={section.title} className="pb-14 text-center">
            <h2 className="section-heading font-display text-2xl font-bold">{section.title}</h2>
            <div className="mt-10 grid gap-x-6 gap-y-10 text-left sm:grid-cols-2 lg:grid-cols-5">
              {section.items.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </section>
        ))}

      {/* Assurances */}
      <section className="grid gap-6 border-t border-border py-12 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { icon: Wallet, title: "ZAR incl. VAT", body: "No surprises at checkout — 15% VAT always included." },
          { icon: Truck, title: "Gauteng delivery", body: "Courier delivery across our active Gauteng zones." },
          { icon: ShieldCheck, title: "Genuine stock", body: "Sourced from authorised distributors." },
          { icon: ArrowRight, title: "Live availability", body: "Stock status shown on every product." },
        ].map((f) => (
          <div key={f.title}>
            <f.icon className="h-5 w-5 text-primary" />
            <h3 className="mt-3 font-display text-sm font-semibold uppercase tracking-[0.1em]">{f.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
