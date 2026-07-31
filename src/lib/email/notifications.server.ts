import { createElement } from "react";
import { render } from "@react-email/render";
import { TechNestEmail, type TechNestEmailProps } from "@/lib/email-templates/technest-email";

/**
 * Server-only TechNest notification dispatcher.
 *
 * Rules:
 *  - Every attempt is written to `email_events` first, so a provider outage is
 *    always visible and retryable.
 *  - `dedupe_key` guarantees the same notification is never sent twice.
 *  - A failure NEVER propagates to the caller: order creation must succeed even
 *    when the email provider is unavailable.
 */

export type EmailEventType =
  | "order_confirmation"
  | "order_staff_notification"
  | "order_status_update"
  | "order_eft_instructions"
  | "order_payment_received"
  | "order_cancelled"
  | "order_dispatched"
  | "order_delivered"
  | "test_message";

export type NotificationInput = {
  event_type: EmailEventType;
  recipient: string;
  subject: string;
  order_id?: string | null;
  dedupe_key: string;
  content: TechNestEmailProps;
  is_test?: boolean;
};

type SendOutcome = { status: "sent" | "failed" | "skipped_duplicate"; message_id?: string; reason?: string };

async function deliver(input: NotificationInput): Promise<SendOutcome> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  const senderDomain = process.env["SENDER_DOMAIN"] ?? process.env["LOVABLE_EMAIL_SENDER_DOMAIN"];
  if (!apiKey || !senderDomain) {
    return {
      status: "failed",
      reason:
        "No verified sender domain is configured yet. The notification is stored and can be retried once the TechNest email domain is verified.",
    };
  }

  try {
    const { sendLovableEmail } = await import("@lovable.dev/email-js");
    const html = await render(createElement(TechNestEmail, input.content));
    const result: any = await sendLovableEmail(
      {
        from: `TechNest <orders@${senderDomain}>`,
        to: input.recipient,
        subject: input.subject,
        html,
      } as any,
      { apiKey, idempotencyKey: input.dedupe_key },
    );
    if (result?.sent === false) return { status: "failed", reason: result.reason ?? "recipient_suppressed" };
    return { status: "sent", message_id: result?.messageId ?? result?.id ?? undefined };
  } catch (e: any) {
    return { status: "failed", reason: e?.code ? `${e.code}: ${e.message}` : (e?.message ?? "Unknown provider error") };
  }
}

/** Queue-and-send. Always resolves; never throws. */
export async function sendNotification(input: NotificationInput): Promise<SendOutcome> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: existing } = await supabaseAdmin
    .from("email_events")
    .select("id, status")
    .eq("dedupe_key", input.dedupe_key)
    .maybeSingle();

  if (existing && existing.status === "sent") return { status: "skipped_duplicate" };

  let eventId = existing?.id;
  if (!eventId) {
    const { data: created, error } = await supabaseAdmin
      .from("email_events")
      .insert({
        event_type: input.event_type,
        recipient: input.recipient,
        order_id: input.order_id ?? null,
        dedupe_key: input.dedupe_key,
        status: "pending",
        payload: { subject: input.subject, content: input.content } as any,
        is_test: input.is_test ?? false,
      })
      .select("id")
      .single();
    if (error || !created) return { status: "failed", reason: error?.message ?? "Could not log the email event." };
    eventId = created.id;
  }

  const outcome = await deliver(input);

  await supabaseAdmin
    .from("email_events")
    .update({
      status: outcome.status === "skipped_duplicate" ? "skipped_duplicate" : outcome.status,
      provider_message_id: outcome.message_id ?? null,
      failure_reason: outcome.reason ?? null,
      attempted_at: new Date().toISOString(),
      retry_count: (existing ? 1 : 0) + ((existing as any)?.retry_count ?? 0),
    })
    .eq("id", eventId);

  return outcome;
}

/** Fire-and-forget wrapper for use inside request handlers. */
export async function tryNotify(input: NotificationInput) {
  try {
    return await sendNotification(input);
  } catch (e) {
    console.error("notification failed", (e as Error).message);
    return { status: "failed" as const, reason: (e as Error).message };
  }
}
