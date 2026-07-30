import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Menu, Search, ShoppingCart, User2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { categoriesQuery } from "@/lib/catalogue";
import { useCart } from "@/lib/cart";
import { useAuth, useRoles } from "@/hooks/use-auth";

export function Header() {
  const { data: categories } = useQuery(categoriesQuery);
  const cart = useCart();
  const { user } = useAuth();
  const { isStaff } = useRoles(user?.id);
  const navigate = useNavigate();
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    navigate({ to: "/shop", search: { q: term || undefined } });
    setOpen(false);
  };

  const nav = (
    <>
      <Link to="/shop" className="text-sm font-medium hover:text-cyan" onClick={() => setOpen(false)}>
        Shop all
      </Link>
      {(categories ?? []).slice(0, 6).map((c) => (
        <Link
          key={c.id}
          to="/category/$slug"
          params={{ slug: c.slug }}
          className="text-sm font-medium hover:text-cyan"
          onClick={() => setOpen(false)}
        >
          {c.name}
        </Link>
      ))}
    </>
  );

  return (
    <header className="sticky top-0 z-50 bg-navy text-navy-foreground">
      <div className="border-b border-sidebar-border/40 bg-navy/60 px-4 py-1.5 text-center text-xs">
        Nationwide delivery across South Africa · All prices in ZAR incl. 15% VAT
      </div>
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild className="lg:hidden">
            <Button variant="ghost" size="icon" className="text-navy-foreground hover:bg-sidebar-accent">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-6">
            <SheetTitle className="mb-4">Browse TechNest</SheetTitle>
            <nav className="flex flex-col gap-4">{nav}</nav>
          </SheetContent>
        </Sheet>

        <Link to="/" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan font-display text-sm font-bold text-cyan-foreground">
            TN
          </span>
          <span className="font-display text-xl font-bold tracking-tight">TechNest</span>
        </Link>

        <form onSubmit={submit} className="relative ml-auto hidden max-w-md flex-1 md:block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search laptops, phones, audio…"
            className="border-0 bg-background pl-9 text-foreground"
            aria-label="Search products"
          />
        </form>

        <div className="ml-auto flex items-center gap-1 md:ml-0">
          {isStaff && (
            <Button asChild variant="ghost" className="hidden text-navy-foreground hover:bg-sidebar-accent sm:inline-flex">
              <Link to="/admin">Admin</Link>
            </Button>
          )}
          <Button asChild variant="ghost" size="icon" className="text-navy-foreground hover:bg-sidebar-accent">
            <Link to={user ? "/account" : "/auth"} aria-label="Account">
              <User2 className="h-5 w-5" />
            </Link>
          </Button>
          <Button asChild variant="ghost" size="icon" className="relative text-navy-foreground hover:bg-sidebar-accent">
            <Link to="/cart" aria-label="Cart">
              <ShoppingCart className="h-5 w-5" />
              {cart.count > 0 && (
                <Badge className="absolute -right-1 -top-1 h-5 min-w-5 justify-center border-0 bg-cyan px-1 text-cyan-foreground">
                  {cart.count}
                </Badge>
              )}
            </Link>
          </Button>
        </div>
      </div>
      <nav className="hidden border-t border-sidebar-border/40 lg:block">
        <div className="mx-auto flex max-w-7xl gap-6 px-4 py-2.5">{nav}</div>
      </nav>
    </header>
  );
}
