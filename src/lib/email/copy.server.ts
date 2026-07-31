import type { TechNestEmailProps } from "@/lib/email-templates/technest-email";

/**
 * Branded copy for every TechNest notification. All order figures come from the
 * server-stored order record — never from browser-supplied totals.
 */
export type OrderEmailEvent =
  | "order_confirmation"
  | "order_staff_notification"
  | "order_eft_instructions"
  | "order_payment_received"
  | "order_status_stock_confirmed"
  | "order_status_awaiting_payment"
  | "order_status_processing"
  | "order_status_ready_for_dispatch"
  | "order_dispatched"
  | "order_delivered"
  | "order_cancelled"
  | "order_refunded"
  | "order_status_update";

export type OrderContext = {
  order_number: string;
  contact_name: string;
  contact_email: string;
  status: string;
  payment_reference?: string | null;
  eft_details?: string | null;
  delivery_note?: string | null;
  support_email?: string | null;
};

type Copy = { subject: string; content: Omit<TechNestEmailProps, "order"> };

export function orderEmailCopy(event: OrderEmailEvent, o: OrderContext): Copy {
  const n = o.order_number;
  const footerNote = o.support_email ? `Questions? Reply to this email or contact ${o.support_email}.` : undefined;
  const wrap = (subject: string, heading: string, intro: string, body?: string[]): Copy => ({
    subject,
    content: { heading, intro, body, footerNote },
  });

  switch (event) {
    case "order_confirmation":
      return wrap(
        `TechNest order ${n} received`,
        `Thank you, ${o.contact_name}`,
        `We have received your order ${n}. Our team will confirm stock availability and be in touch shortly.`,
      );
    case "order_staff_notification":
      return wrap(
        `New TechNest order ${n}`,
        "New order received",
        `${o.contact_name} (${o.contact_email}) placed order ${n}.`,
        ["Open the TechNest staff console to confirm stock and progress this order."],
      );
    case "order_eft_instructions":
      return wrap(
        `Payment instructions for TechNest order ${n}`,
        "How to pay by EFT",
        `Please use the banking details below and quote ${n} as your payment reference.`,
        [o.eft_details ?? "Our banking details will be sent to you by a TechNest consultant."],
      );
    case "order_payment_received":
      return wrap(
        `Payment received for TechNest order ${n}`,
        "Payment received",
        `We have confirmed your EFT payment for order ${n}.`,
        o.payment_reference ? [`Payment reference: ${o.payment_reference}`] : undefined,
      );
    case "order_status_stock_confirmed":
      return wrap(
        `Stock confirmed for TechNest order ${n}`,
        "Stock confirmed",
        `Good news — all items on order ${n} are confirmed and reserved for you.`,
      );
    case "order_status_awaiting_payment":
      return wrap(
        `TechNest order ${n} is awaiting payment`,
        "Awaiting payment",
        `Order ${n} is ready for payment. Once payment reflects we will begin processing.`,
        o.eft_details ? [o.eft_details] : undefined,
      );
    case "order_status_processing":
      return wrap(
        `TechNest order ${n} is being processed`,
        "Your order is being processed",
        `We are preparing order ${n} for dispatch.`,
      );
    case "order_status_ready_for_dispatch":
      return wrap(
        `TechNest order ${n} is ready for dispatch`,
        "Ready for dispatch",
        `Order ${n} is packed and waiting for collection by our courier.`,
        o.delivery_note ? [o.delivery_note] : undefined,
      );
    case "order_dispatched":
      return wrap(
        `TechNest order ${n} has shipped`,
        "Your order is on its way",
        `Order ${n} has been dispatched for nationwide delivery.`,
        o.delivery_note ? [o.delivery_note] : undefined,
      );
    case "order_delivered":
      return wrap(
        `TechNest order ${n} delivered`,
        "Delivered",
        `Order ${n} has been marked as delivered. Thank you for shopping with TechNest.`,
      );
    case "order_cancelled":
      return wrap(
        `TechNest order ${n} cancelled`,
        "Your order has been cancelled",
        `Order ${n} has been cancelled and any reserved stock has been released.`,
      );
    case "order_refunded":
      return wrap(
        `Refund processed for TechNest order ${n}`,
        "Refund processed",
        `A refund has been processed for order ${n}. Please allow your bank a few working days to reflect it.`,
        o.payment_reference ? [`Original payment reference: ${o.payment_reference}`] : undefined,
      );
    default:
      return wrap(
        `TechNest order ${n} update`,
        "Your order status has changed",
        `Order ${n} is now "${o.status.replace(/_/g, " ")}".`,
      );
  }
}
