import { createFileRoute, Link } from "@tanstack/react-router";
import { ContentPage } from "@/components/site/ContentPage";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms & Conditions | TechNest" },
      {
        name: "description",
        content:
          "TechNest terms and conditions of sale: pricing in ZAR incl. VAT, order acceptance, stock confirmation, delivery, payment and liability.",
      },
      { property: "og:title", content: "Terms & Conditions | TechNest" },
      { property: "og:description", content: "The terms that apply to every TechNest order." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <ContentPage
      title="Terms & conditions"
      updated="July 2026"
      intro="These terms govern your use of technest and every order placed through this store."
    >
      <section>
        <h2>1. Pricing</h2>
        <p>
          All prices are quoted in South African Rand and include 15% VAT. Delivery is quoted
          separately at checkout. Prices may change without notice, but the price confirmed on your
          order is the price that applies to that order.
        </p>
      </section>
      <section>
        <h2>2. Orders and acceptance</h2>
        <p>
          Placing an order is an offer to buy. A contract of sale comes into effect only once we
          confirm stock availability and accept your order. Where a supplier must confirm stock, we
          tell you before any payment is requested.
        </p>
      </section>
      <section>
        <h2>3. Stock and availability</h2>
        <p>
          Availability shown on the site reflects the latest supplier catalogue and our own stock
          records. If an item becomes unavailable after you order, we will offer an equivalent
          product or a full refund.
        </p>
      </section>
      <section>
        <h2>4. Errors</h2>
        <p>
          We take care to publish accurate prices and specifications, but obvious errors are not
          binding. If a price is materially incorrect we will contact you before processing and you
          may cancel at no cost.
        </p>
      </section>
      <section>
        <h2>5. Payment</h2>
        <p>
          Payment terms are confirmed with your order. Goods remain the property of TechNest until
          payment reflects in full. Manual EFT payments are only confirmed once received and
          reconciled against your order reference.
        </p>
      </section>
      <section>
        <h2>6. Delivery</h2>
        <p>
          Delivery fees and lead times are calculated at checkout from your postal code and cart, as
          described on our{" "}
          <Link to="/delivery" className="text-primary underline">
            delivery page
          </Link>
          . Lead times are estimates in business days and are not guaranteed dates.
        </p>
      </section>
      <section>
        <h2>7. Returns and warranty</h2>
        <p>
          Your rights under the Consumer Protection Act are set out in our{" "}
          <Link to="/returns" className="text-primary underline">
            returns policy
          </Link>
          , which forms part of these terms.
        </p>
      </section>
      <section>
        <h2>8. Accounts</h2>
        <p>
          You are responsible for keeping your account credentials confidential and for activity
          under your account. Tell us immediately if you suspect unauthorised use.
        </p>
      </section>
      <section>
        <h2>9. Liability</h2>
        <p>
          To the extent permitted by law, TechNest is not liable for indirect or consequential loss.
          Nothing in these terms limits your rights under the Consumer Protection Act.
        </p>
      </section>
      <section>
        <h2>10. Governing law</h2>
        <p>
          These terms are governed by the laws of the Republic of South Africa, and disputes are
          subject to the jurisdiction of the South African courts.
        </p>
      </section>
    </ContentPage>
  );
}
