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
 * Every value in the email comes from the stored order row.
 */
export const notifyOrderEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        order_id: z.string().uuid(),
        event: z.enum([
          "order_confirmation",
          "order_staff_notification",
          "order_status_update",
          "order_eft_instructions",
          "order_payment_received",
          "order_status_stock_confirmed",
          "order_status_awaiting_payment",
          "order_status_processing",
          "order_status_ready_for_dispatch",
          "order_cancelled",
          "order_refunded",
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
    const { orderEmailCopy } = await import("@/lib/email/copy.server");
    const { getEmailConfig } = await import("@/lib/email/config.server");

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

    const cfg = getEmailConfig();
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

    const copy = orderEmailCopy(data.event, {
      order_number: order.order_number,
      contact_name: order.contact_name,
      contact_email: order.contact_email,
      status: order.status,
      payment_reference: order.payment_reference,
      eft_details: settings?.eft_details ?? null,
      delivery_note: settings?.delivery_note ?? null,
      support_email: cfg.supportAddress ?? settings?.store_email ?? null,
    });

    const staffRecipient = cfg.orderNotificationAddress ?? settings?.store_email ?? null;
    const recipient = data.event === "order_staff_notification" ? staffRecipient : order.contact_email;
    if (!recipient) return { ok: false as const, error: "No notification recipient is configured." };

    const outcome = await tryNotify({
      event_type: data.event as any,
      recipient,
      order_id: order.id,
      dedupe_key: `${data.event}:${order.id}:${order.status}`,
      subject: copy.subject,
      content: { ...copy.content, order: orderBlock },
    });

    return { ok: true as const, outcome };
  });

