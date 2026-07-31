import { createFileRoute, Link } from "@tanstack/react-router";
import { ContentPage } from "@/components/site/ContentPage";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy | TechNest" },
      {
        name: "description",
        content:
          "How TechNest collects, uses and protects your personal information under South Africa's POPI Act, including your access, correction and deletion rights.",
      },
      { property: "og:title", content: "Privacy Policy | TechNest" },
      { property: "og:description", content: "TechNest POPIA privacy policy and your data rights." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <ContentPage
      title="Privacy policy"
      updated="July 2026"
      intro="TechNest processes personal information in line with the Protection of Personal Information Act 4 of 2013 (POPIA)."
    >
      <section>
        <h2>What we collect</h2>
        <ul>
          <li>Account details: name, email address and phone number.</li>
          <li>Order details: delivery address, postal code, order contents and order history.</li>
          <li>Support correspondence and delivery enquiries you send us.</li>
          <li>Technical data such as device and browser information used to keep the site secure.</li>
        </ul>
      </section>
      <section>
        <h2>Why we process it</h2>
        <ul>
          <li>To create your account and authenticate you.</li>
          <li>To quote delivery, fulfil orders and arrange collection.</li>
          <li>To send transactional email about your orders and password resets.</li>
          <li>To meet tax, invoicing and consumer-protection obligations.</li>
        </ul>
        <p>
          We do not sell your personal information, and we do not send marketing email unless you
          have asked us to.
        </p>
      </section>
      <section>
        <h2>Who we share it with</h2>
        <p>
          We share only what is necessary with our couriers (delivery address and contact number),
          our hosting and database provider, and our transactional email provider. Where a supplier
          must confirm stock, we share the product and quantity — never your payment details.
        </p>
      </section>
      <section>
        <h2>Payment information</h2>
        <p>
          TechNest does not store card numbers. When a payment gateway is used, card data is
          captured and processed by that provider under their own PCI-DSS certification.
        </p>
      </section>
      <section>
        <h2>How long we keep it</h2>
        <p>
          Order and invoice records are retained for 5 years as required by South African tax law.
          Account data is retained until you ask us to delete it, after which we keep only the
          minimum records the law requires.
        </p>
      </section>
      <section>
        <h2>Your rights</h2>
        <ul>
          <li>Ask what personal information we hold about you.</li>
          <li>Ask us to correct or delete inaccurate information.</li>
          <li>Object to processing, or withdraw consent where processing relies on it.</li>
          <li>Lodge a complaint with the Information Regulator of South Africa.</li>
        </ul>
        <p>
          To exercise any of these, contact us via the{" "}
          <Link to="/contact" className="text-primary underline">
            contact page
          </Link>
          .
        </p>
      </section>
      <section>
        <h2>Cookies and local storage</h2>
        <p>
          We use browser storage to keep you signed in and to remember your cart between visits.
          These are strictly necessary for the store to work. Any analytics we add is limited to
          aggregate, non-identifying usage measurement.
        </p>
      </section>
      <section>
        <h2>Security</h2>
        <p>
          Access to customer data is restricted by row-level database policies, order totals and
          delivery fees are calculated server-side, and staff access is limited to named team
          members with assigned roles.
        </p>
      </section>
    </ContentPage>
  );
}
