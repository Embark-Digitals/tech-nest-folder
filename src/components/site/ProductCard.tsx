import { Link } from "@tanstack/react-router";
import { ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StockBadge } from "@/components/site/StockBadge";
import { formatZAR } from "@/lib/format";
import { primaryImage, type ProductRow } from "@/lib/catalogue";
import { useCart } from "@/lib/cart";
import { toast } from "sonner";

export function ProductCard({ product }: { product: ProductRow }) {
  const cart = useCart();
  const image = primaryImage(product);
  const buyable = product.selling_price_incl_vat != null && product.stock_status !== "out_of_stock";

  return (
    <div className="group flex h-full flex-col">
      <Link
        to="/product/$slug"
        params={{ slug: product.slug }}
        className="relative block aspect-square overflow-hidden bg-muted"
      >
        {image ? (
          <img
            src={image}
            alt={product.name}
            loading="lazy"
            className="h-full w-full object-contain p-6 transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No image
          </div>
        )}
        <div className="absolute left-3 top-3 flex flex-wrap gap-1">
          {product.is_promotional && (
            <Badge className="border-0 bg-primary text-[10px] uppercase tracking-wider text-primary-foreground">
              Promo
            </Badge>
          )}
          {product.is_new_arrival && (
            <Badge className="border-0 bg-foreground text-[10px] uppercase tracking-wider text-background">New</Badge>
          )}
          {product.is_clearance && (
            <Badge className="border-0 bg-destructive text-[10px] uppercase tracking-wider text-destructive-foreground">
              Clearance
            </Badge>
          )}
        </div>
      </Link>

      <div className="flex flex-1 flex-col items-center gap-1.5 px-2 py-4 text-center">
        <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          {product.brands?.name ?? "TechNest"}
        </p>
        <Link
          to="/product/$slug"
          params={{ slug: product.slug }}
          className="line-clamp-2 text-sm font-medium transition-colors hover:text-primary"
        >
          {product.name}
        </Link>
        <StockBadge status={product.stock_status} quantity={product.quantity} />
        <p className="mt-1 font-display text-base font-bold text-primary">
          {formatZAR(product.selling_price_incl_vat)}
        </p>
        <div className="mt-auto w-full pt-3">
          <Button
            variant="outline"
            className="w-full rounded-full border-foreground/15 text-xs uppercase tracking-[0.12em] transition-colors hover:border-primary hover:bg-primary hover:text-primary-foreground"
            disabled={!buyable}
            onClick={() => {
              cart.add({
                productId: product.id,
                sku: product.sku,
                name: product.name,
                slug: product.slug,
                price: product.selling_price_incl_vat ?? 0,
                image,
              });
              toast.success(`${product.name} added to cart`);
            }}
          >
            <ShoppingCart className="mr-2 h-4 w-4" />
            {buyable ? "Add to cart" : "Unavailable"}
          </Button>
        </div>
      </div>
    </div>
  );
}
