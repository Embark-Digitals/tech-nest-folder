import { createFileRoute, Link } from "@tanstack/react-router";
import { canonicalHead } from "@/lib/site";
import { ContentPage } from "@/components/site/ContentPage";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About TechNest | South African Technology Retailer" },
      {
        name: "description",
        content:
          "TechNest is a South African retailer of televisions, appliances and audio visual technology, with transparent ZAR pricing incl. VAT and Gauteng delivery.",
      },
      { property: "og:title", content: "About TechNest" },
      {
        property: "og:description",
        content: "Who we are, what we sell and how we price — TechNest, South Africa.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      canonicalHead("/about").meta,
    ],
    links: [canonicalHead("/about").link],
  }),
  component: AboutPage,
});

function AboutPage() {
  return (
    <ContentPage
      title="About TechNest"
      intro="A South African technology retailer built on genuine stock, honest pricing and dependable delivery."
    >
      <section>
        <h2>Who we are</h2>
        <p>
          TechNest supplies televisions, refrigeration, laundry, cooking, small appliances and audio
          visual technology to South African households and businesses. Our catalogue is sourced
          directly from authorised local suppliers, so every unit we sell is genuine, locally
          supported stock — never grey imports.
        </p>
      </section>
      <section>
        <h2>Transparent pricing</h2>
        <p>
          Every price shown on TechNest is in South African Rand and includes 15% VAT. There are no
          hidden handling charges: the price you see on the product page is the price that carries
          through to your cart. Delivery is quoted separately and calculated from your postal code
          before you place the order.
        </p>
      </section>
      <section>
        <h2>Where we deliver</h2>
        <p>
          We currently deliver across serviced areas of Gauteng, with collection available by
          appointment. Our delivery zones, fees and lead times are shown at checkout as soon as you
          enter your address. We are expanding into further provinces — if you are outside Gauteng,
          send us a delivery enquiry from checkout and we will quote you directly.
        </p>
      </section>
      <section>
        <h2>How ordering works</h2>
        <ul>
          <li>Add products to your cart and enter your delivery address at checkout.</li>
          <li>Your delivery fee is calculated on our servers from your zone and item types.</li>
          <li>We confirm stock and, where required, supplier lead times.</li>
          <li>Payment is arranged once your order is confirmed, then we dispatch or prepare collection.</li>
        </ul>
      </section>
      <div className="flex flex-wrap gap-3 pt-2">
        <Button asChild>
          <Link to="/shop">Browse products</Link>
        </Button>
        <Button asChild variant="secondary">
          <Link to="/contact">Contact us</Link>
        </Button>
      </div>
    </ContentPage>
  );
}
