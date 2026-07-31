/**
 * Server-only TechNest email configuration.
 *
 * Every domain- or address-specific value is read from the environment so that
 * no Lovable preview domain is ever baked into a production email. Once the
 * TechNest domain is supplied, setting these variables is the only change
 * required to start sending.
 */

export type EmailConfig = {
  apiKey: string | undefined;
  senderDomain: string | undefined;
  fromAddress: string;
  fromName: string;
  supportAddress: string | undefined;
  orderNotificationAddress: string | undefined;
  appUrl: string | undefined;
  ready: boolean;
  missing: string[];
};

const FROM_NAME = "TechNest";

export function getEmailConfig(): EmailConfig {
  const env = process.env;
  const apiKey = env["LOVABLE_API_KEY"];
  const senderDomain = env["SENDER_DOMAIN"] ?? env["LOVABLE_EMAIL_SENDER_DOMAIN"];
  const fromLocal = env["EMAIL_FROM_ADDRESS"] ?? (senderDomain ? `orders@${senderDomain}` : "");
  const fromAddress = fromLocal.includes("@") ? fromLocal : senderDomain ? `${fromLocal}@${senderDomain}` : "";

  const missing: string[] = [];
  if (!apiKey) missing.push("LOVABLE_API_KEY");
  if (!senderDomain) missing.push("SENDER_DOMAIN");

  return {
    apiKey,
    senderDomain,
    fromAddress,
    fromName: env["EMAIL_FROM_NAME"] ?? FROM_NAME,
    supportAddress: env["SUPPORT_EMAIL_ADDRESS"],
    orderNotificationAddress: env["ORDER_NOTIFICATION_EMAIL"],
    appUrl: env["PUBLIC_APP_URL"],
    ready: missing.length === 0,
    missing,
  };
}
