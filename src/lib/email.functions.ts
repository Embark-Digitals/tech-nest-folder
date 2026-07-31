import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertStaff(context: any, adminOnly = false) {
  const { data } = await context.supabase.rpc(adminOnly ? "is_admin" : "is_staff", { _user_id: context.userId });
  if (!data) throw new Error("Not permitted.");
}

/** Retry a previously failed notification. Idempotent — a sent event is never resent. */
export const retryEmailEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ event_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context, true);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: ev } = await supabaseAdmin.from("email_events").select("*").eq("id", data.event_id).maybeSingle();
    if (!ev) return { ok: false as const, error: "Notification not found." };
    if (ev.status === "sent") return { ok: false as const, error: "This notification was already delivered." };

    const payload = (ev.payload ?? {}) as any;
    const { sendNotification } = await import("@/lib/email/notifications.server");
    const outcome = await sendNotification({
      event_type: ev.event_type as any,
      recipient: ev.recipient,
      order_id: ev.order_id,
      dedupe_key: ev.dedupe_key,
      subject: payload.subject ?? "TechNest notification",
      content: payload.content ?? { heading: "TechNest", intro: "Notification" },
      is_test: ev.is_test,
    });
    return { ok: outcome.status === "sent", outcome };
  });

/** Send a branded test message to verify provider configuration. */
export const sendTestEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ recipient: z.string().email().max(255) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context, true);
    const { sendNotification } = await import("@/lib/email/notifications.server");
    const outcome = await sendNotification({
      event_type: "test_message",
      recipient: data.recipient,
      dedupe_key: `test:${data.recipient}:${Date.now()}`,
      subject: "TechNest email delivery test",
      is_test: true,
      content: {
        heading: "Email delivery test",
        intro: "This is a TechNest test message confirming that transactional email delivery is working.",
        body: ["If you received this, order confirmations and status updates will reach your customers."],
      },
    });
    return { ok: outcome.status === "sent", outcome };
  });

/**
 * Queue the notifications for an order event. Called after the order or its
 * status has already been written, so email problems never block the order.
 */
export const notifyOrderEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        order_id: z.string().uuid(),
        event: z.enum([
          "order_confirmation",
          "order_status_update",
          "order_eft_instructions",
          "order_payment_received",
          "order_cancelled",
          "order_dispatched",
          "order_delivered",
        ]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { tryNotify } = await import("@/lib/email/notifications.server");

    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id, order_number, contact_name, contact_email, status, total_incl_vat, payment_reference")
      .eq("id", data.order_id)
      .maybeSingle();
    if (!order) return { ok: false as const, error: "Order not found." };

    const { data: items } = await supabaseAdmin
      .from("order_items")
      .select("name, quantity, line_total_incl_vat")
      .eq("order_id", order.id);

    const { data: settings } = await supabaseAdmin
      .from("site_settings")
      .select("store_email, eft_details, delivery_note")
      .limit(1)
      .maybeSingle();

    const orderBlock = {
      order_number: order.order_number,
      total_incl_vat: Number(order.total_incl_vat),
      status: order.status,
      items: (items ?? []).map((i) => ({
        name: i.name,
        quantity: i.quantity,
        line_total_incl_vat: Number(i.line_total_incl_vat),
      })),
    };

    const copy: Record<string, { subject: string; heading: string; intro: string; body?: string[] }> = {
      order_confirmation: {
        subject: `TechNest order ${order.order_number} received`,
        heading: `Thank you, ${order.contact_name}`,
        intro: `We have received your order ${order.order_number}. Our team will confirm stock and be in touch shortly.`,
      },
      order_status_update: {
        subject: `TechNest order ${order.order_number} update`,
        heading: "Your order status has changed",
        intro: `Order ${order.order_number} is now "${order.status.replace(/_/g, " ")}".`,
      },
      order_eft_instructions: {
        subject: `Payment instructions for TechNest order ${order.order_number}`,
        heading: "How to pay by EFT",
        intro: `Please use the banking details below and quote ${order.order_number} as your payment reference.`,
        body: [settings?.eft_details ?? "Our banking details will be sent to you by a consultant."],
      },
      order_payment_received: {
        subject: `Payment received for TechNest order ${order.order_number}`,
        heading: "Payment received",
        intro: `We have confirmed your payment for order ${order.order_number}. Reference ${order.payment_reference ?? "—"}.`,
      },
      order_cancelled: {
        subject: `TechNest order ${order.order_number} cancelled`,
        heading: "Your order has been cancelled",
        intro: `Order ${order.order_number} has been cancelled. Any reserved stock has been released.`,
      },
      order_dispatched: {
        subject: `TechNest order ${order.order_number} dispatched`,
        heading: "Your order is on its way",
        intro: `Order ${order.order_number} has been dispatched. ${settings?.delivery_note ?? ""}`.trim(),
      },
      order_delivered: {
        subject: `TechNest order ${order.order_number} delivered`,
        heading: "Delivered",
        intro: `Order ${order.order_number} has been marked as delivered. Thank you for shopping with TechNest.`,
      },
    };

    const c = copy[data.event];
    const outcome = await tryNotify({
      event_type: data.event,
      recipient: order.contact_email,
      order_id: order.id,
      dedupe_key: `${data.event}:${order.id}:${order.status}`,
      subject: c.subject,
      content: {
        heading: c.heading,
        intro: c.intro,
        body: c.body,
        order: orderBlock,
        footerNote: settings?.store_email ? `Questions? Reply or email ${settings.store_email}.` : undefined,
      },
    });

    return { ok: true as const, outcome };
  });
