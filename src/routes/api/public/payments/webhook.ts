import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

/**
 * Structure for a FUTURE verified payment-gateway webhook.
 *
 * No gateway is connected yet. Until PAYMENT_WEBHOOK_SECRET is configured this
 * endpoint refuses every request. When a gateway is added:
 *   1. Set PAYMENT_WEBHOOK_SECRET.
 *   2. Map the provider payload to { order_id, reference, method, amount }.
 *   3. Payment status is only ever written through the admin/service-role
 *      `mark_order_paid` routine, which also verifies the settled amount.
 */
const payloadSchema = z.object({
  order_id: z.string().uuid(),
  reference: z.string().min(1).max(200),
  method: z.string().min(1).max(50).optional(),
  amount: z.number().positive(),
  status: z.enum(["paid", "failed", "cancelled"]),
});

export const Route = createFileRoute("/api/public/payments/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.PAYMENT_WEBHOOK_SECRET;
        if (!secret) {
          return new Response("Payment gateway not configured", { status: 503 });
        }

        const raw = await request.text();
        const signature = request.headers.get("x-payment-signature") ?? "";
        const expected = createHmac("sha256", secret).update(raw).digest("hex");
        const sigBuf = Buffer.from(signature);
        const expBuf = Buffer.from(expected);
        if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
          return new Response("Invalid signature", { status: 401 });
        }

        const parsed = payloadSchema.safeParse(JSON.parse(raw));
        if (!parsed.success) {
          return new Response("Invalid payload", { status: 400 });
        }
        if (parsed.data.status !== "paid") {
          return new Response("ok", { status: 200 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error } = await supabaseAdmin.rpc("mark_order_paid", {
          _order_id: parsed.data.order_id,
          _payment_reference: parsed.data.reference,
          _payment_method: parsed.data.method ?? "gateway",
          _amount_incl_vat: parsed.data.amount,
        });

        if (error) {
          console.error("mark_order_paid failed", error.message);
          return new Response("Settlement rejected", { status: 409 });
        }

        return new Response("ok", { status: 200 });
      },
    },
  },
});
