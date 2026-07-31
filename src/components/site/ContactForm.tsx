import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { submitContactMessage } from "@/lib/contact.functions";

const REASONS = [
  { value: "general", label: "General enquiry" },
  { value: "sales", label: "Sales / product advice" },
  { value: "order_status", label: "Order status" },
  { value: "delivery", label: "Delivery or collection" },
  { value: "returns", label: "Returns and refunds" },
  { value: "warranty", label: "Warranty or repair" },
  { value: "billing", label: "Billing / EFT payment" },
  { value: "other", label: "Something else" },
];

type Errors = Partial<Record<"name" | "email" | "message" | "reason", string>>;

export function ContactForm() {
  const submit = useServerFn(submitContactMessage);
  const [values, setValues] = useState({
    name: "",
    email: "",
    phone: "",
    order_number: "",
    reason: "general",
    message: "",
    company: "", // honeypot
  });
  const [errors, setErrors] = useState<Errors>({});
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const set = (key: keyof typeof values) => (v: string) =>
    setValues((prev) => ({ ...prev, [key]: v }));

  const validate = () => {
    const next: Errors = {};
    if (values.name.trim().length < 2) next.name = "Please enter your name.";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(values.email.trim()))
      next.email = "Enter a valid email address.";
    if (values.message.trim().length < 10)
      next.message = "Please give us a little more detail (at least 10 characters).";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSending(true);
    try {
      const result = await submit({ data: values });
      if (!result.ok) {
        toast.error(result.error ?? "We couldn't send your message. Please try again.");
        return;
      }
      setSent(true);
      setValues({
        name: "",
        email: "",
        phone: "",
        order_number: "",
        reason: "general",
        message: "",
        company: "",
      });
      toast.success("Message sent — our team will reply on the next business day.");
    } catch {
      toast.error("We couldn't send your message. Please email us instead.");
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <div className="rounded-lg border border-primary/40 bg-primary/5 p-6 not-prose">
        <h3 className="font-display text-lg font-semibold text-foreground">Thanks — we have your message</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          A member of the TechNest team will reply by email on the next business day. If your query is
          urgent, phone us during business hours.
        </p>
        <Button variant="outline" className="mt-4" onClick={() => setSent(false)}>
          Send another message
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="not-prose grid gap-4 rounded-lg border border-border p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="contact-name">Name *</Label>
          <Input
            id="contact-name"
            value={values.name}
            maxLength={100}
            onChange={(e) => set("name")(e.target.value)}
            aria-invalid={!!errors.name}
          />
          {errors.name && <p className="mt-1 text-xs text-destructive">{errors.name}</p>}
        </div>
        <div>
          <Label htmlFor="contact-email">Email *</Label>
          <Input
            id="contact-email"
            type="email"
            value={values.email}
            maxLength={255}
            onChange={(e) => set("email")(e.target.value)}
            aria-invalid={!!errors.email}
          />
          {errors.email && <p className="mt-1 text-xs text-destructive">{errors.email}</p>}
        </div>
        <div>
          <Label htmlFor="contact-phone">Phone (optional)</Label>
          <Input
            id="contact-phone"
            value={values.phone}
            maxLength={30}
            onChange={(e) => set("phone")(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="contact-order">Order number (optional)</Label>
          <Input
            id="contact-order"
            value={values.order_number}
            maxLength={40}
            placeholder="TN-000123"
            onChange={(e) => set("order_number")(e.target.value)}
          />
        </div>
      </div>

      <div>
        <Label htmlFor="contact-reason">Reason for contact *</Label>
        <Select value={values.reason} onValueChange={set("reason")}>
          <SelectTrigger id="contact-reason">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {REASONS.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor="contact-message">Message *</Label>
        <Textarea
          id="contact-message"
          rows={5}
          maxLength={2000}
          value={values.message}
          onChange={(e) => set("message")(e.target.value)}
          aria-invalid={!!errors.message}
        />
        {errors.message && <p className="mt-1 text-xs text-destructive">{errors.message}</p>}
        <p className="mt-1 text-xs text-muted-foreground">{values.message.length}/2000</p>
      </div>

      {/* Honeypot — hidden from people, tempting to bots. */}
      <div aria-hidden className="hidden">
        <label htmlFor="contact-company">Company</label>
        <input
          id="contact-company"
          tabIndex={-1}
          autoComplete="off"
          value={values.company}
          onChange={(e) => set("company")(e.target.value)}
        />
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={sending}>
          {sending ? "Sending…" : "Send message"}
        </Button>
        <p className="text-xs text-muted-foreground">
          We use your details only to answer this enquiry. See our privacy policy.
        </p>
      </div>
    </form>
  );
}
