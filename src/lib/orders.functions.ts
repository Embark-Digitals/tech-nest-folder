import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Secure checkout input. The browser may ONLY send product ids, quantities,
 * contact/delivery details, the delivery option and a submission key.
 * Prices, VAT, delivery fee, totals, payment status and user id are derived
 * server-side inside the `place_order` database routine.
 */
const placeOrderSchema = z.object({
  items: z
    .array(
      z.object({
        product_id: z.string().uuid("Invalid product reference"),
        quantity: z.number().int().min(1).max(99),
      }),
    )
    .min(1, "Your cart is empty")
    .max(50, "Too many line items"),
  contact_name: z.string().trim().min(2).max(100),
  contact_email: z.string().trim().email().max(255),
  contact_phone: z.string().trim().min(8).max(20),
  delivery_method: z.enum(["courier", "collection"]),
  delivery_address: z
    .object({
      line1: z.string().trim().min(3).max(200),
      suburb: z.string().trim().max(100).nullable().optional(),
      city: z.string().trim().min(2).max(100),
      province: z.string().trim().min(2).max(100),
      postal_code: z.string().trim().min(4).max(10),
    })
    .nullable(),
  customer_notes: z.string().trim().max(1000).nullable().optional(),
  idempotency_key: z.string().trim().min(8).max(100),
});

export type PlaceOrderInput = z.infer<typeof placeOrderSchema>;

export type PlaceOrderResult =
  | {
      ok: true;
      order: {
        id: string;
        order_number: string;
        subtotal_incl_vat: number;
        vat_amount: number;
        delivery_fee: number;
        total_incl_vat: number;
        duplicate: boolean;
      };
    }
  | { ok: false; error: string };

export const placeOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => placeOrderSchema.parse(data))
  .handler(async ({ data, context }): Promise<PlaceOrderResult> => {
    if (data.delivery_method === "courier" && !data.delivery_address) {
      return { ok: false, error: "A delivery address is required for courier delivery." };
    }

    const { data: result, error } = await context.supabase.rpc("place_order", {
      _items: data.items,
      _contact_name: data.contact_name,
      _contact_email: data.contact_email,
      _contact_phone: data.contact_phone,
      _delivery_address: data.delivery_method === "collection" ? null : data.delivery_address,
      _delivery_method: data.delivery_method,
      _customer_notes: data.customer_notes ?? "",
      _idempotency_key: data.idempotency_key,
    });

    if (error) {
      console.error("place_order failed", error.message);
      return { ok: false, error: error.message.replace(/^.*?:\s*/, "") };
    }

    const order = result as unknown as Extract<PlaceOrderResult, { ok: true }>["order"];

    // Notifications are best-effort: an email provider outage must never stop
    // an order from being created. Failures are logged and stay retryable.
    if (!order.duplicate) {
      try {
        const { tryNotify } = await import("@/lib/email/notifications.server");
        const { getEmailConfig } = await import("@/lib/email/config.server");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: settings } = await supabaseAdmin
          .from("site_settings")
          .select("store_email")
          .limit(1)
          .maybeSingle();
        const staffRecipient = getEmailConfig().orderNotificationAddress ?? settings?.store_email ?? null;

        const orderBlock = {
          order_number: order.order_number,
          total_incl_vat: Number(order.total_incl_vat),
          status: "new",
        };

        await tryNotify({
          event_type: "order_confirmation",
          recipient: data.contact_email,
          order_id: order.id,
          dedupe_key: `order_confirmation:${order.id}`,
          subject: `TechNest order ${order.order_number} received`,
          content: {
            heading: `Thank you, ${data.contact_name}`,
            intro: `We have received your order ${order.order_number}. Our team will confirm stock and be in touch shortly.`,
            order: orderBlock,
          },
        });

        if (staffRecipient) {
          await tryNotify({
            event_type: "order_staff_notification",
            recipient: staffRecipient,
            order_id: order.id,
            dedupe_key: `order_staff_notification:${order.id}`,
            subject: `New TechNest order ${order.order_number}`,
            content: {
              heading: "New order received",
              intro: `${data.contact_name} (${data.contact_email}) placed order ${order.order_number}.`,
              order: orderBlock,
            },
          });
        }
      } catch (e) {
        console.error("order notifications failed", (e as Error).message);
      }
    }

    return { ok: true, order };
  });

