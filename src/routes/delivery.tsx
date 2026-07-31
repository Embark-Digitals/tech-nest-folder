import { createFileRoute, Link } from "@tanstack/react-router";
import { ContentPage } from "@/components/site/ContentPage";

export const Route = createFileRoute("/delivery")({
  head: () => ({
    meta: [
      { title: "Delivery & Collection | TechNest Gauteng" },
      {
        name: "description",
        content:
          "TechNest delivery zones, fees and lead times across Gauteng, plus collection by appointment. Fees are calculated at checkout from your postal code.",
      },
      { property: "og:title", content: "Delivery & Collection | TechNest" },
      { property: "og:description", content: "Gauteng delivery zones, fees, lead times and collection." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DeliveryPage,
});

function DeliveryPage() {
  return (
    <ContentPage
      title="Delivery & collection"
      intro="TechNest currently delivers within serviced Gauteng zones. Your exact fee and lead time are calculated at checkout."
    >
      <section>
        <h2>How your delivery fee is calculated</h2>
        <p>
          Enter your province and four digit postal code at checkout. Our system matches that postal
          code to a delivery zone and returns a fee, an estimated lead time and any surcharges that
          apply to the items in your cart. The fee is recalculated on our servers when you place the
          order, so the amount you are charged always matches your address and cart.
        </p>
      </section>
      <section>
        <h2>Zones and lead times</h2>
        <ul>
          <li>
            <strong>Johannesburg metro</strong> — 1–2 business days.
          </li>
          <li>
            <strong>Pretoria / Tshwane</strong> — 1–3 business days.
          </li>
          <li>
            <strong>Ekurhuleni</strong> — 1–3 business days.
          </li>
          <li>
            <strong>West Rand and Vaal</strong> — 2–4 business days, remote surcharges may apply.
          </li>
        </ul>
        <p>
          Selected zones offer free delivery once your cart passes that zone's threshold. When it
          applies, checkout shows "free delivery threshold reached".
        </p>
      </section>
      <section>
        <h2>Item surcharges</h2>
        <p>
          Some products need special handling. Where they apply, surcharges are itemised in your
          order summary before you pay:
        </p>
        <ul>
          <li>Fragile handling — screens, glassware and display panels.</li>
          <li>Oversized item — large-format appliances and cabinets.</li>
          <li>Heavy item — units that require a two-person lift.</li>
          <li>Collection only — items that cannot travel by standard courier.</li>
        </ul>
      </section>
      <section>
        <h2>Collection</h2>
        <p>
          Collection is free and available by appointment. Choose collection at checkout and we will
          confirm your collection slot once your order and stock are confirmed. Bring your order
          number and a matching ID.
        </p>
      </section>
      <section>
        <h2>Outside Gauteng</h2>
        <p>
          We are expanding province by province. If your address falls outside a serviced zone,
          checkout offers a delivery enquiry — send it and our team will quote you directly. No
          order is placed until you accept that quote.
        </p>
      </section>
      <section>
        <h2>Receiving your order</h2>
        <ul>
          <li>Someone over 18 must be present to accept and sign for the delivery.</li>
          <li>Inspect packaging on arrival and note any visible damage on the waybill.</li>
          <li>Report transit damage within 48 hours — see our <Link to="/returns" className="text-primary underline">returns policy</Link>.</li>
        </ul>
      </section>
    </ContentPage>
  );
}
