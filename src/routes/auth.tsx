import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { appPath, publicAppUrl } from "@/lib/site-url";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign In or Register | TechNest" },
      { name: "description", content: "Sign in to your TechNest account to track orders, save wishlists and check out faster." },
      { property: "og:title", content: "Sign In or Register | TechNest" },
      { property: "og:description", content: "Access your TechNest account." },
    ],
  }),
  component: AuthPage,
});

const credentials = z.object({
  email: z.string().trim().email("Enter a valid email").max(255),
  password: z.string().min(8, "Password must be at least 8 characters").max(72),
});

function AuthPage() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const signIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = Object.fromEntries(new FormData(e.currentTarget));
    const parsed = credentials.safeParse(form);
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword(parsed.data);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Welcome back");
    navigate({ to: "/account" });
  };

  const signUp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const parsed = credentials.safeParse(form);
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      ...parsed.data,
      options: {
        emailRedirectTo: publicAppUrl(),
        data: { full_name: form.full_name ?? "" },
      },
    });
    if (!error && data.user) {
      await supabase
        .from("profiles")
        .insert({ id: data.user.id, email: data.user.email, full_name: form.full_name ?? null });
    }
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Account created — check your email to confirm.");
  };

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <h1 className="text-center font-display text-3xl font-bold">Your TechNest account</h1>
      <p className="mt-2 text-center text-sm text-muted-foreground">
        Track orders, save wishlists and check out faster.
      </p>

      <Card className="mt-8 p-6">
        <Tabs defaultValue="signin">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="signin">Sign in</TabsTrigger>
            <TabsTrigger value="signup">Register</TabsTrigger>
          </TabsList>

          <TabsContent value="signin">
            <form onSubmit={signIn} className="space-y-4 pt-4">
              <div>
                <Label htmlFor="si-email">Email</Label>
                <Input id="si-email" name="email" type="email" className="mt-1" required />
              </div>
              <div>
                <Label htmlFor="si-password">Password</Label>
                <Input id="si-password" name="password" type="password" className="mt-1" required />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                Sign in
              </Button>
              <button
                type="button"
                className="w-full text-center text-sm text-muted-foreground underline-offset-2 hover:underline"
                onClick={async () => {
                  const email = (document.getElementById("si-email") as HTMLInputElement | null)?.value?.trim();
                  const valid = z.string().email().safeParse(email ?? "");
                  if (!valid.success) return toast.error("Enter your email address above first.");
                  setBusy(true);
                  await supabase.auth.resetPasswordForEmail(valid.data, {
                    redirectTo: appPath("/auth/reset"),
                  });
                  setBusy(false);
                  // Never reveal whether an account exists for this address.
                  toast.success("If that email is registered, a password reset link is on its way.");
                }}
              >
                Forgot your password?
              </button>
            </form>
          </TabsContent>

          <TabsContent value="signup">
            <form onSubmit={signUp} className="space-y-4 pt-4">
              <div>
                <Label htmlFor="su-name">Full name</Label>
                <Input id="su-name" name="full_name" className="mt-1" maxLength={100} />
              </div>
              <div>
                <Label htmlFor="su-email">Email</Label>
                <Input id="su-email" name="email" type="email" className="mt-1" required />
              </div>
              <div>
                <Label htmlFor="su-password">Password</Label>
                <Input id="su-password" name="password" type="password" className="mt-1" required />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                Create account
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  );
}
