import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ShieldCheck, Truck, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ProductCard } from "@/components/site/ProductCard";
import { categoriesQuery, productsQuery } from "@/lib/catalogue";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "TechNest | Buy Laptops, Phones & Gaming Gear in South Africa" },
      {
        name: "description",
        content:
          "Shop laptops, smartphones, audio and gaming tech at TechNest. Transparent ZAR pricing incl. VAT, live stock status and nationwide delivery.",
      },
      { property: "og:title", content: "TechNest | Tech Store South Africa" },
      {
        property: "og:description",
        content: "Laptops, smartphones, audio and gaming gear in ZAR incl. VAT with nationwide delivery.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const { data: categories } = useQuery(categoriesQuery);
  const { data: products, isLoading } = useQuery(productsQuery({ sort: "new" }));

  const featured = (products ?? []).filter((p) => p.is_featured).slice(0, 4);
  const promos = (products ?? []).filter((p) => p.is_promotional).slice(0, 4);
  const newArrivals = (products ?? []).filter((p) => p.is_new_arrival).slice(0, 4);

  return (
    <div>
      <section className="hero-gradient text-navy-foreground">
        <div className="mx-auto grid max-w-7xl items-center gap-8 px-4 py-16 lg:grid-cols-2 lg:py-24">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan">Proudly South African</p>
            <h1 className="mt-4 font-display text-4xl font-bold leading-tight sm:text-5xl">
              Technology that lands at your door, priced in Rand.
            </h1>
            <p className="mt-4 max-w-lg text-navy-foreground/80">
              Genuine laptops, smartphones, audio and gaming gear with live stock status, VAT-inclusive
              pricing and nationwide delivery.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link to="/shop">
                  Shop all products <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="secondary">
                <Link to="/category/$slug" params={{ slug: "laptops" }}>
                  Browse laptops
                </Link>
              </Button>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { icon: Wallet, title: "ZAR incl. VAT", body: "No surprises at checkout — 15% VAT always included." },
              { icon: Truck, title: "Nationwide delivery", body: "Delivered anywhere in South Africa." },
              { icon: ShieldCheck, title: "Genuine stock", body: "Sourced from authorised distributors." },
              { icon: ArrowRight, title: "Live availability", body: "Stock status shown on every product." },
            ].map((f) => (
              <div key={f.title} className="rounded-xl bg-navy-foreground/10 p-4 backdrop-blur">
                <f.icon className="h-5 w-5 text-cyan" />
                <h2 className="mt-2 font-display text-base font-semibold">{f.title}</h2>
                <p className="mt-1 text-sm text-navy-foreground/75">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-12">
        <h2 className="font-display text-2xl font-bold">Shop by category</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(categories ?? []).map((c) => (
            <Link key={c.id} to="/category/$slug" params={{ slug: c.slug }}>
              <Card className="h-full p-6 transition-colors hover:border-primary">
                <h3 className="font-display text-lg font-semibold">{c.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{c.description}</p>
                <span className="mt-3 inline-flex items-center text-sm font-medium text-primary">
                  Browse <ArrowRight className="ml-1 h-4 w-4" />
                </span>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      {[
        { title: "Featured products", items: featured },
        { title: "On promotion", items: promos },
        { title: "New arrivals", items: newArrivals },
      ].map((section) => (
        <section key={section.title} className="mx-auto max-w-7xl px-4 py-8">
          <div className="flex items-end justify-between">
            <h2 className="font-display text-2xl font-bold">{section.title}</h2>
            <Button asChild variant="ghost">
              <Link to="/shop">View all</Link>
            </Button>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {isLoading
              ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-96 w-full" />)
              : section.items.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        </section>
      ))}
    </div>
  );
}
