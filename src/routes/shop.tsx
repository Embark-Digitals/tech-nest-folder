import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProductCard } from "@/components/site/ProductCard";
import { brandsQuery, categoriesQuery, productsQuery } from "@/lib/catalogue";

const searchSchema = z.object({
  q: z.string().optional(),
  category: z.string().optional(),
  brand: z.string().optional(),
  sort: z.string().optional(),
});

export const Route = createFileRoute("/shop")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Shop All Tech | TechNest South Africa" },
      {
        name: "description",
        content:
          "Browse the full TechNest catalogue — laptops, smartphones, audio, gaming and accessories with ZAR pricing incl. VAT.",
      },
      { property: "og:title", content: "Shop All Tech | TechNest" },
      { property: "og:description", content: "The full TechNest catalogue with live stock and ZAR pricing." },
    ],
  }),
  component: Shop,
});

function Shop() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/shop" });
  const { data: categories } = useQuery(categoriesQuery);
  const { data: brands } = useQuery(brandsQuery);
  const { data: products, isLoading } = useQuery(
    productsQuery({
      search: search.q,
      category: search.category,
      brand: search.brand,
      sort: search.sort,
    }),
  );

  type ShopSearch = z.infer<typeof searchSchema>;
  const update = (patch: Partial<ShopSearch>) =>
    navigate({ search: (prev: ShopSearch) => ({ ...prev, ...patch }) });


  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <h1 className="font-display text-3xl font-bold">Shop all products</h1>
      <p className="mt-1 text-muted-foreground">
        {products?.length ?? 0} products · all prices in ZAR incl. 15% VAT
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Input
          placeholder="Search products"
          defaultValue={search.q ?? ""}
          onChange={(e) => update({ q: e.target.value || undefined })}
          aria-label="Search products"
        />
        <Select
          value={search.category ?? "all"}
          onValueChange={(v) => update({ category: v === "all" ? undefined : v })}
        >
          <SelectTrigger aria-label="Category">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {(categories ?? []).map((c) => (
              <SelectItem key={c.id} value={c.slug}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={search.brand ?? "all"}
          onValueChange={(v) => update({ brand: v === "all" ? undefined : v })}
        >
          <SelectTrigger aria-label="Brand">
            <SelectValue placeholder="Brand" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All brands</SelectItem>
            {(brands ?? []).map((b) => (
              <SelectItem key={b.id} value={b.slug}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={search.sort ?? "new"} onValueChange={(v) => update({ sort: v })}>
          <SelectTrigger aria-label="Sort">
            <SelectValue placeholder="Sort" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="new">Newest</SelectItem>
            <SelectItem value="price_asc">Price: low to high</SelectItem>
            <SelectItem value="price_desc">Price: high to low</SelectItem>
            <SelectItem value="name">Name A–Z</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {isLoading
          ? Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-96 w-full" />)
          : (products ?? []).map((p) => <ProductCard key={p.id} product={p} />)}
      </div>

      {!isLoading && (products?.length ?? 0) === 0 && (
        <div className="py-20 text-center">
          <p className="text-muted-foreground">No products match your filters.</p>
          <Button className="mt-4" onClick={() => navigate({ search: {} })}>
            Clear filters
          </Button>
        </div>
      )}
    </div>
  );
}
