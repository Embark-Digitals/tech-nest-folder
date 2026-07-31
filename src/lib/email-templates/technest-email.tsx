import * as React from "react";
import { Body, Container, Head, Heading, Hr, Html, Preview, Section, Text } from "@react-email/components";

const main = { backgroundColor: "#ffffff", fontFamily: "Helvetica, Arial, sans-serif", color: "#1a1a1a" };
const container = { maxWidth: "560px", margin: "0 auto", padding: "24px" };
const brandBar = { backgroundColor: "#111827", padding: "16px 24px", borderRadius: "8px" };
const brand = { color: "#ffffff", fontSize: "20px", fontWeight: 700, margin: 0 };
const accent = { color: "#dc2626" };
const muted = { color: "#6b7280", fontSize: "12px" };
const th = { textAlign: "left" as const, fontSize: "12px", color: "#6b7280", padding: "6px 0" };
const td = { fontSize: "14px", padding: "6px 0", borderBottom: "1px solid #f3f4f6" };

export type OrderLine = { name: string; quantity: number; line_total_incl_vat: number };

export type TechNestEmailProps = {
  heading: string;
  intro: string;
  order?: {
    order_number: string;
    total_incl_vat: number;
    status?: string;
    items?: OrderLine[];
  };
  body?: string[];
  footerNote?: string;
};

const zar = (n: number) =>
  `R ${Number(n).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Single branded TechNest email shell used by every notification type.
 * Content is passed as plain props — no raw HTML is ever injected.
 */
export function TechNestEmail({ heading, intro, order, body = [], footerNote }: TechNestEmailProps) {
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{intro}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={brandBar}>
            <Text style={brand}>
              Tech<span style={accent}>Nest</span>
            </Text>
          </Section>

          <Heading style={{ fontSize: "22px", marginTop: "24px" }}>{heading}</Heading>
          <Text style={{ fontSize: "15px", lineHeight: "22px" }}>{intro}</Text>

          {body.map((p, i) => (
            <Text key={i} style={{ fontSize: "15px", lineHeight: "22px" }}>
              {p}
            </Text>
          ))}

          {order && (
            <Section style={{ marginTop: "16px" }}>
              <Text style={{ fontSize: "14px", margin: "0 0 8px" }}>
                <strong>Order {order.order_number}</strong>
                {order.status ? ` · ${order.status.replace(/_/g, " ")}` : ""}
              </Text>
              {order.items?.length ? (
                <table width="100%" cellPadding={0} cellSpacing={0}>
                  <thead>
                    <tr>
                      <th style={th}>Item</th>
                      <th style={{ ...th, textAlign: "right" }}>Qty</th>
                      <th style={{ ...th, textAlign: "right" }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.items.map((it, i) => (
                      <tr key={i}>
                        <td style={td}>{it.name}</td>
                        <td style={{ ...td, textAlign: "right" }}>{it.quantity}</td>
                        <td style={{ ...td, textAlign: "right" }}>{zar(it.line_total_incl_vat)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
              <Text style={{ fontSize: "16px", fontWeight: 700, marginTop: "12px" }}>
                Total (incl. 15% VAT): {zar(order.total_incl_vat)}
              </Text>
            </Section>
          )}

          <Hr style={{ borderColor: "#e5e7eb", margin: "24px 0" }} />
          {footerNote && <Text style={muted}>{footerNote}</Text>}
          <Text style={muted}>
            TechNest · Gauteng delivery and collection · All prices in ZAR incl. 15% VAT
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
