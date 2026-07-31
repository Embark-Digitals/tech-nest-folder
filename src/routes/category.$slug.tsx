import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ProductCard } from "@/components/site/ProductCard";
import { categoriesQuery, productsQuery } from "@/lib/catalogue";

export const Route = createFileRoute("/category/$slug")({
  head: ({ params }) => {
    const name = params.slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    return {
      meta: [
        { title: `${name} | TechNest South Africa` },
        {
          name: "description",
          content: `Shop ${name.toLowerCase()} at TechNest. ZAR pricing incl. VAT, live stock status and Gauteng delivery.`,
        },
        { property: "og:title", content: `${name} | TechNest` },
        { property: "og:description", content: `Shop ${name.toLowerCase()} with ZAR pricing incl. VAT.` },
      ],
    };
  },
  component: CategoryPage,
});

function CategoryPage() {
  const { slug } = Route.useParams();
  const { data: categories } = useQuery(categoriesQuery);
  const { data: products, isLoading } = useQuery(productsQuery({ category: slug }));
  const category = (categories ?? []).find((c) => c.slug === slug);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <nav className="text-sm text-muted-foreground">
        <Link to="/" className="hover:text-primary">
          Home
        </Link>{" "}
        / <Link to="/shop" className="hover:text-primary">Shop</Link> /{" "}
        <span className="text-foreground">{category?.name ?? slug}</span>
      </nav>

      <h1 className="mt-3 font-display text-3xl font-bold">{category?.name ?? slug}</h1>
      {category?.description && <p className="mt-1 text-muted-foreground">{category.description}</p>}

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {isLoading
          ? Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-96 w-full" />)
          : (products ?? []).map((p) => <ProductCard key={p.id} product={p} />)}
      </div>

      {!isLoading && (products?.length ?? 0) === 0 && (
        <div className="py-20 text-center">
          <p className="text-muted-foreground">No products in this category yet.</p>
          <Button asChild className="mt-4">
            <Link to="/shop">Browse all products</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
