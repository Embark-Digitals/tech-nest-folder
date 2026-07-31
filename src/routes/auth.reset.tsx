import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth/reset")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Reset Your Password | TechNest" },
      { name: "description", content: "Choose a new password for your TechNest account and get straight back to shopping." },
      { property: "og:title", content: "Reset Your Password | TechNest" },
      { property: "og:description", content: "Choose a new password for your TechNest account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPasswordPage,
});

const schema = z
  .object({
    password: z.string().min(8, "Password must be at least 8 characters").max(72),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: "Passwords do not match", path: ["confirm"] });

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState<"checking" | "valid" | "invalid">("checking");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Supabase puts the recovery session in the URL fragment and exchanges it
    // automatically. An expired or already-used link leaves no session.
    let cancelled = false;
    const check = async () => {
      const { data } = await supabase.auth.getSession();
      if (!cancelled) setReady(data.session ? "valid" : "invalid");
    };
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady("valid");
    });
    const t = setTimeout(check, 600);
    return () => {
      cancelled = true;
      clearTimeout(t);
      sub.subscription.unsubscribe();
    };
  }, []);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const parsed = schema.safeParse(Object.fromEntries(new FormData(e.currentTarget)));
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Password updated — you are signed in.");
    navigate({ to: "/account" });
  };

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <h1 className="text-center font-display text-3xl font-bold">Choose a new password</h1>

      <Card className="mt-8 p-6">
        {ready === "checking" && <p className="text-sm text-muted-foreground">Checking your reset link…</p>}

        {ready === "invalid" && (
          <div className="space-y-4 text-sm">
            <p className="text-muted-foreground">
              This password reset link is invalid or has expired. Reset links can only be used once and expire for your
              security.
            </p>
            <Button className="w-full" onClick={() => navigate({ to: "/auth" })}>
              Request a new reset link
            </Button>
          </div>
        )}

        {ready === "valid" && (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label htmlFor="password">New password</Label>
              <Input id="password" name="password" type="password" className="mt-1" required minLength={8} maxLength={72} />
            </div>
            <div>
              <Label htmlFor="confirm">Confirm new password</Label>
              <Input id="confirm" name="confirm" type="password" className="mt-1" required minLength={8} maxLength={72} />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              Update password
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
