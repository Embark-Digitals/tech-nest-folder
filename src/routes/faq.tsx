import { createFileRoute, Link } from "@tanstack/react-router";
import { canonicalHead } from "@/lib/site";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const FAQS: { q: string; a: string }[] = [
  {
    q: "Are TechNest prices in Rand and do they include VAT?",
    a: "Yes. Every price on TechNest is in South African Rand and includes 15% VAT. Delivery is quoted separately at checkout and shown before you place your order.",
  },
  {
    q: "Where does TechNest deliver?",
    a: "We currently deliver within serviced Gauteng zones, including Johannesburg, Tshwane, Ekurhuleni, the West Rand and the Vaal. Collection is available by appointment, and we are expanding to further provinces.",
  },
  {
    q: "How is my delivery fee calculated?",
    a: "Your fee is calculated on our servers from your postal code, the delivery zone it falls into and the handling class of the items in your cart. It is recalculated when you place your order, so the amount charged always matches your address and cart.",
  },
  {
    q: "How long does delivery take?",
    a: "Johannesburg metro is typically 1–2 business days. Tshwane and Ekurhuleni are 1–3 business days, and the West Rand and Vaal are 2–4 business days. Items awaiting supplier confirmation are quoted before payment.",
  },
  {
    q: "Do you offer free delivery?",
    a: "Selected zones have a free delivery threshold. When your cart passes it, checkout shows 'free delivery threshold reached' and the fee falls away.",
  },
  {
    q: "Why does my order say it needs supplier confirmation?",
    a: "Some items are supplied to order. We confirm availability and lead time with the supplier before any payment is requested, and you can cancel at no cost if the lead time does not suit you.",
  },
  {
    q: "How do I pay?",
    a: "Payment terms are confirmed with your order once stock is verified. Manual EFT is confirmed against your order reference before dispatch. Goods remain our property until payment reflects in full.",
  },
  {
    q: "Is the stock genuine and does it carry warranty?",
    a: "Yes. All stock is sourced from authorised South African suppliers and carries the manufacturer's local warranty, normally 12 to 24 months depending on the product.",
  },
  {
    q: "Can I return something I changed my mind about?",
    a: "Yes. You may cancel within 7 calendar days of delivery under the ECT Act, provided the item is unused, complete and in its original packaging. You cover the return cost and we refund the purchase price.",
  },
  {
    q: "What if my order arrives damaged?",
    a: "Report transit damage within 48 hours with photographs of the packaging and the unit. We collect the item and arrange a replacement or refund at our cost.",
  },
  {
    q: "Can I collect my order instead?",
    a: "Yes. Choose collection at checkout — it is free. We confirm your collection slot once your order and stock are confirmed. Bring your order number and matching ID.",
  },
  {
    q: "How do I track my order?",
    a: "Sign in and open My account. Each order shows its current status, delivery zone, estimated lead time and delivery fee, and we email you as the status changes.",
  },
];

export const Route = createFileRoute("/faq")({
  head: () => ({
    meta: [
      { title: "Frequently Asked Questions | TechNest" },
      {
        name: "description",
        content:
          "Answers on TechNest pricing in ZAR incl. VAT, Gauteng delivery fees and lead times, collection, payment, warranty and returns.",
      },
      { property: "og:title", content: "TechNest FAQ" },
      { property: "og:description", content: "Delivery, pricing, payment, warranty and returns questions answered." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: FAQS.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
          })),
        }),
      },
      canonicalHead("/faq").meta,
    ],
    links: [canonicalHead("/faq").link],
  }),
  component: FaqPage,
});

function FaqPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-14">
      <h1 className="font-display text-3xl font-bold sm:text-4xl">Frequently asked questions</h1>
      <p className="mt-4 text-lg text-muted-foreground">
        Delivery, pricing, payment, warranty and returns — the questions our customers ask most.
      </p>
      <Accordion type="single" collapsible className="mt-10">
        {FAQS.map((f) => (
          <AccordionItem key={f.q} value={f.q}>
            <AccordionTrigger className="text-left">{f.q}</AccordionTrigger>
            <AccordionContent className="text-muted-foreground">{f.a}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
      <p className="mt-10 text-sm text-muted-foreground">
        Still stuck?{" "}
        <Link to="/contact" className="text-primary underline">
          Contact our team
        </Link>{" "}
        and we will come back to you on the next business day.
      </p>
    </div>
  );
}
