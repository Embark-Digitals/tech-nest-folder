import { Link } from "@tanstack/react-router";
import { ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
    <Card className="group flex h-full flex-col overflow-hidden p-0 transition-shadow hover:shadow-lg">
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
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No image
          </div>
        )}
        <div className="absolute left-3 top-3 flex flex-wrap gap-1">
          {product.is_promotional && <Badge className="border-0 bg-primary text-primary-foreground">Promo</Badge>}
          {product.is_new_arrival && <Badge className="border-0 bg-cyan text-cyan-foreground">New</Badge>}
          {product.is_clearance && (
            <Badge className="border-0 bg-destructive text-destructive-foreground">Clearance</Badge>
          )}
        </div>
      </Link>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          {product.brands?.name ?? "TechNest"}
        </p>
        <Link
          to="/product/$slug"
          params={{ slug: product.slug }}
          className="line-clamp-2 font-semibold leading-snug hover:text-primary"
        >
          {product.name}
        </Link>
        <StockBadge status={product.stock_status} quantity={product.quantity} />
        <div className="mt-auto pt-2">
          <p className="font-display text-lg font-bold">{formatZAR(product.selling_price_incl_vat)}</p>
          <p className="text-xs text-muted-foreground">VAT incl.</p>
          <Button
            className="mt-3 w-full"
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
    </Card>
  );
}
