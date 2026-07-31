import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Public contact-form submission.
 *
 * The browser has no INSERT privilege on `contact_messages` (staff-read only),
 * so submissions go through this server function, which validates, rate-limits
 * and writes with the service client. That keeps the inbox private while still
 * accepting messages from signed-out visitors.
 */
const REASONS = [
  "general",
  "sales",
  "order_status",
  "delivery",
  "returns",
  "warranty",
  "billing",
  "other",
] as const;

const contactSchema = z.object({
  name: z.string().trim().min(2, "Please enter your name").max(100),
  email: z.string().trim().email("Enter a valid email address").max(255),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  order_number: z.string().trim().max(40).optional().or(z.literal("")),
  reason: z.enum(REASONS),
  message: z.string().trim().min(10, "Please give us a little more detail").max(2000),
  // Honeypot: hidden from real users, filled by naive bots.
  company: z.string().max(0).optional().or(z.literal("")),
});

export type ContactReason = (typeof REASONS)[number];

const RATE_LIMIT_WINDOW_MINUTES = 10;
const RATE_LIMIT_MAX = 3;

export const submitContactMessage = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => contactSchema.parse(data))
  .handler(async ({ data }) => {
    // Silently accept honeypot hits so bots get no signal, but never store them.
    if (data.company) return { ok: true as const, rate_limited: false as const };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60_000).toISOString();
    const { count, error: countError } = await supabaseAdmin
      .from("contact_messages")
      .select("id", { count: "exact", head: true })
      .eq("email", data.email.toLowerCase())
      .gte("created_at", since);

    if (countError) throw new Error("We couldn't send your message. Please try again.");
    if ((count ?? 0) >= RATE_LIMIT_MAX) {
      return {
        ok: false as const,
        rate_limited: true as const,
        error: `You've sent ${RATE_LIMIT_MAX} messages in the last ${RATE_LIMIT_WINDOW_MINUTES} minutes. Please give us a moment to reply.`,
      };
    }

    const { data: row, error } = await supabaseAdmin
      .from("contact_messages")
      .insert({
        name: data.name,
        email: data.email.toLowerCase(),
        phone: data.phone || null,
        order_number: data.order_number || null,
        reason: data.reason,
        message: data.message,
      })
      .select("id")
      .single();

    if (error) throw new Error("We couldn't send your message. Please try again.");

    return { ok: true as const, rate_limited: false as const, id: row.id };
  });
