import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Mail, MapPin, Phone } from "lucide-react";
import { ContentPage } from "@/components/site/ContentPage";
import { siteSettingsQuery } from "@/lib/catalogue";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact TechNest | Sales & Support South Africa" },
      {
        name: "description",
        content:
          "Reach the TechNest team for sales, delivery and support queries. Email, phone and WhatsApp, weekdays 08:00–17:00 SAST.",
      },
      { property: "og:title", content: "Contact TechNest" },
      { property: "og:description", content: "Sales, delivery and support contact details for TechNest." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ContactPage,
});

function ContactPage() {
  const { data: settings } = useQuery(siteSettingsQuery);
  const email = settings?.store_email ?? "sales@technest.co.za";
  const phone = settings?.store_phone ?? "+27 00 000 0000";
  const whatsapp = settings?.whatsapp_number;

  return (
    <ContentPage
      title="Contact TechNest"
      intro="Sales, delivery and after-sales support. We reply to every enquiry on the next business day at the latest."
    >
      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-border p-4">
          <h3 className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-primary" /> Email
          </h3>
          <a href={`mailto:${email}`} className="mt-2 block text-foreground hover:text-primary">
            {email}
          </a>
        </div>
        <div className="rounded-lg border border-border p-4">
          <h3 className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-primary" /> Phone
          </h3>
          <a href={`tel:${phone.replace(/\s/g, "")}`} className="mt-2 block text-foreground hover:text-primary">
            {phone}
          </a>
          {whatsapp && <p className="mt-1">WhatsApp: {whatsapp}</p>}
        </div>
      </section>
      <section>
        <h2>Business hours</h2>
        <ul>
          <li>Monday to Friday: 08:00 – 17:00 SAST</li>
          <li>Saturday: 09:00 – 13:00 SAST</li>
          <li>Sunday and public holidays: closed</li>
        </ul>
      </section>
      <section>
        <h2>Collection and delivery</h2>
        <p className="flex items-start gap-2">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <span>
            {settings?.delivery_note ??
              "Delivery within serviced Gauteng zones, calculated at checkout from your postal code. Collection available by appointment."}
          </span>
        </p>
      </section>
      <section>
        <h2>What to include in your message</h2>
        <ul>
          <li>Your order number, if you already placed an order.</li>
          <li>The product SKU or name you are asking about.</li>
          <li>Your suburb and postal code for delivery questions.</li>
        </ul>
      </section>
    </ContentPage>
  );
}
