import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Mail, Phone, Truck } from "lucide-react";
import { categoriesQuery, siteSettingsQuery } from "@/lib/catalogue";

export function Footer() {
  const { data: categories } = useQuery(categoriesQuery);
  const { data: settings } = useQuery(siteSettingsQuery);

  return (
    <footer className="mt-16 bg-navy text-navy-foreground">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan font-display text-sm font-bold text-cyan-foreground">
              TN
            </span>
            <span className="font-display text-lg font-bold">TechNest</span>
          </div>
          <p className="mt-3 text-sm text-navy-foreground/70">
            South African technology retailer. Genuine stock, transparent ZAR pricing and nationwide delivery.
          </p>
        </div>

        <div>
          <h3 className="font-display text-sm font-semibold uppercase tracking-wide">Shop</h3>
          <ul className="mt-3 space-y-2 text-sm text-navy-foreground/70">
            <li>
              <Link to="/shop" className="hover:text-cyan">
                All products
              </Link>
            </li>
            {(categories ?? []).slice(0, 5).map((c) => (
              <li key={c.id}>
                <Link to="/category/$slug" params={{ slug: c.slug }} className="hover:text-cyan">
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="font-display text-sm font-semibold uppercase tracking-wide">Account</h3>
          <ul className="mt-3 space-y-2 text-sm text-navy-foreground/70">
            <li>
              <Link to="/account" className="hover:text-cyan">
                My account
              </Link>
            </li>
            <li>
              <Link to="/cart" className="hover:text-cyan">
                Cart
              </Link>
            </li>
            <li>
              <Link to="/checkout" className="hover:text-cyan">
                Checkout
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <h3 className="font-display text-sm font-semibold uppercase tracking-wide">Contact</h3>
          <ul className="mt-3 space-y-2 text-sm text-navy-foreground/70">
            <li className="flex items-center gap-2">
              <Mail className="h-4 w-4" /> {settings?.store_email ?? "sales@technest.co.za"}
            </li>
            <li className="flex items-center gap-2">
              <Phone className="h-4 w-4" /> {settings?.store_phone ?? "+27 00 000 0000"}
            </li>
            <li className="flex items-start gap-2">
              <Truck className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{settings?.delivery_note ?? "Nationwide delivery available."}</span>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-sidebar-border/40 py-4 text-center text-xs text-navy-foreground/60">
        © {new Date().getFullYear()} TechNest. All prices in South African Rand incl. 15% VAT.
      </div>
    </footer>
  );
}
