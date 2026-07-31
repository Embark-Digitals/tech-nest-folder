import { createFileRoute, Link } from "@tanstack/react-router";
import { ContentPage } from "@/components/site/ContentPage";

export const Route = createFileRoute("/returns")({
  head: () => ({
    meta: [
      { title: "Returns, Warranty & Refunds | TechNest" },
      {
        name: "description",
        content:
          "TechNest returns, warranty and refund policy under the South African Consumer Protection Act: cooling-off, defective goods, transit damage and refund timelines.",
      },
      { property: "og:title", content: "Returns, Warranty & Refunds | TechNest" },
      { property: "og:description", content: "How to return, exchange or claim warranty on a TechNest order." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReturnsPage,
});

function ReturnsPage() {
  return (
    <ContentPage
      title="Returns, warranty & refunds"
      updated="July 2026"
      intro="Your rights under the Consumer Protection Act 68 of 2008 and the Electronic Communications and Transactions Act 25 of 2002, and how we apply them."
    >
      <section>
        <h2>Cooling-off period</h2>
        <p>
          Because TechNest sells online, you may cancel an order within 7 calendar days of delivery
          or collection without giving a reason, in line with section 44 of the ECT Act. The product
          must be unused, complete and in its original packaging. You are responsible for the cost
          of returning the goods, and we refund the purchase price within 30 days of the return
          reaching us.
        </p>
      </section>
      <section>
        <h2>Defective or unsafe goods</h2>
        <p>
          Section 56 of the Consumer Protection Act gives you 6 months from delivery to return goods
          that are defective, unsafe or not fit for their intended purpose. In that window you
          choose whether we repair, replace or refund — at no charge to you, including the cost of
          collecting the item.
        </p>
      </section>
      <section>
        <h2>Transit damage</h2>
        <p>
          Inspect your delivery on arrival. Report any damage to the packaging or unit within 48
          hours of receipt with photographs of the box and the product. We arrange collection and a
          replacement or refund at our cost.
        </p>
      </section>
      <section>
        <h2>Manufacturer warranty</h2>
        <p>
          All products carry the manufacturer's South African warranty — normally 12 to 24 months,
          shown on the product page where the supplier specifies it. Warranty claims after the first
          6 months are handled through the manufacturer's authorised service network; contact us and
          we will log the claim on your behalf.
        </p>
      </section>
      <section>
        <h2>What we cannot accept</h2>
        <ul>
          <li>Goods damaged by misuse, unauthorised repair, or incorrect installation.</li>
          <li>Consumables and opened software, media or hygiene-sealed items.</li>
          <li>Items missing serial numbers, original accessories or packaging, for cooling-off returns.</li>
        </ul>
      </section>
      <section>
        <h2>How to start a return</h2>
        <ul>
          <li>Email us from the <Link to="/contact" className="text-primary underline">contact page</Link> with your order number and the reason.</li>
          <li>We respond with a return reference and collection or drop-off instructions.</li>
          <li>Once we receive and inspect the item, we confirm the repair, replacement or refund.</li>
        </ul>
      </section>
      <section>
        <h2>Refunds</h2>
        <p>
          Approved refunds are paid to the original payment method or bank account within 10
          business days of inspection. Delivery fees are refunded when the return is due to a
          defect, damage or our error.
        </p>
      </section>
    </ContentPage>
  );
}
