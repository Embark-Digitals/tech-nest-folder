import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Mail, Phone, Truck } from "lucide-react";
import { categoriesQuery, siteSettingsQuery } from "@/lib/catalogue";

export function Footer() {
  const { data: categories } = useQuery(categoriesQuery);
  const { data: settings } = useQuery(siteSettingsQuery);

  return (
    <footer className="mt-20 border-t border-border bg-muted text-foreground">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <div className="flex items-baseline gap-0.5">
            <span className="font-display text-xl font-bold text-primary">T</span>
            <span className="font-display text-xl font-bold">echNest</span>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            South African technology retailer. Genuine stock, transparent ZAR pricing and Gauteng delivery.
          </p>
        </div>

        <div>
          <h3 className="font-display text-xs font-semibold uppercase tracking-[0.14em]">Shop</h3>
          <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
            <li>
              <Link to="/shop" className="hover:text-primary">
                All products
              </Link>
            </li>
            {(categories ?? []).slice(0, 5).map((c) => (
              <li key={c.id}>
                <Link to="/category/$slug" params={{ slug: c.slug }} className="hover:text-primary">
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="font-display text-xs font-semibold uppercase tracking-[0.14em]">Help</h3>
          <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
            <li>
              <Link to="/about" className="hover:text-primary">
                About TechNest
              </Link>
            </li>
            <li>
              <Link to="/delivery" className="hover:text-primary">
                Delivery &amp; collection
              </Link>
            </li>
            <li>
              <Link to="/faq" className="hover:text-primary">
                FAQ
              </Link>
            </li>
            <li>
              <Link to="/returns" className="hover:text-primary">
                Returns &amp; warranty
              </Link>
            </li>
            <li>
              <Link to="/account" className="hover:text-primary">
                My account
              </Link>
            </li>
          </ul>
        </div>


        <div>
          <h3 className="font-display text-xs font-semibold uppercase tracking-[0.14em]">Contact</h3>
          <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
            <li className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-primary" /> {settings?.store_email ?? "sales@technest.co.za"}
            </li>
            <li className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-primary" /> {settings?.store_phone ?? "+27 00 000 0000"}
            </li>
            <li className="flex items-start gap-2">
              <Truck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>{settings?.delivery_note ?? "Delivery within Gauteng. Collection available."}</span>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-border py-4 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} TechNest. All prices in South African Rand incl. 15% VAT.
      </div>
    </footer>
  );
}
