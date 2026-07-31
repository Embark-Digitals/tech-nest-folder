import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

export const ROLE_LABELS: Record<AppRole, string> = {
  super_admin: "Super admin",
  admin: "Admin",
  catalogue_manager: "Catalogue manager",
  order_manager: "Order manager",
  customer: "Customer",
};

const STAFF_ROLES: AppRole[] = ["super_admin", "admin", "catalogue_manager", "order_manager"];

export function TeamPanel({ currentUserId }: { currentUserId: string }) {
  const qc = useQueryClient();
  const [term, setTerm] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-team"],
    queryFn: async () => {
      const [profiles, roles] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, email, full_name, phone, created_at")
          .order("created_at", { ascending: false }),
        supabase.from("user_roles").select("id, user_id, role"),
      ]);
      if (profiles.error) throw profiles.error;
      if (roles.error) throw roles.error;
      return { profiles: profiles.data ?? [], roles: roles.data ?? [] };
    },
  });

  const grant = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: AppRole }) => {
      const { error } = await supabase.from("user_roles").insert({ user_id: userId, role });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Role granted");
      qc.invalidateQueries({ queryKey: ["admin-team"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revoke = useMutation({
    mutationFn: async (roleRowId: string) => {
      const { error } = await supabase.from("user_roles").delete().eq("id", roleRowId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Role removed");
      qc.invalidateQueries({ queryKey: ["admin-team"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = useMemo(() => {
    const q = term.trim().toLowerCase();
    return (data?.profiles ?? [])
      .map((p) => ({
        ...p,
        roles: (data?.roles ?? []).filter((r) => r.user_id === p.id),
      }))
      .filter((p) =>
        q
          ? (p.email ?? "").toLowerCase().includes(q) ||
            (p.full_name ?? "").toLowerCase().includes(q)
          : true,
      )
      .sort((a, b) => {
        const aStaff = a.roles.some((r) => STAFF_ROLES.includes(r.role as AppRole)) ? 0 : 1;
        const bStaff = b.roles.some((r) => STAFF_ROLES.includes(r.role as AppRole)) ? 0 : 1;
        return aStaff - bStaff;
      });
  }, [data, term]);

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <p className="text-sm text-muted-foreground">
          Team members sign in with their normal TechNest account at <strong>/auth</strong>. Grant
          them a staff role here and the admin console unlocks for them immediately.
        </p>
      </Card>

      <Input
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        placeholder="Search by name or email…"
        className="max-w-sm"
        aria-label="Search team members"
      />

      <div className="rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Person</TableHead>
              <TableHead>Roles</TableHead>
              <TableHead className="w-56">Grant role</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  <div className="font-medium">{p.full_name ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">{p.email}</div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {p.roles.length === 0 && (
                      <span className="text-xs text-muted-foreground">No roles</span>
                    )}
                    {p.roles.map((r) => (
                      <Badge
                        key={r.id}
                        variant={
                          STAFF_ROLES.includes(r.role as AppRole) ? "default" : "secondary"
                        }
                        className="gap-1"
                      >
                        {ROLE_LABELS[r.role as AppRole]}
                        {!(p.id === currentUserId && r.role === "super_admin") && (
                          <button
                            type="button"
                            aria-label={`Remove ${ROLE_LABELS[r.role as AppRole]}`}
                            className="ml-1 opacity-70 hover:opacity-100"
                            onClick={() => revoke.mutate(r.id)}
                          >
                            ×
                          </button>
                        )}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  <Select
                    value=""
                    onValueChange={(role) =>
                      grant.mutate({ userId: p.id, role: role as AppRole })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Add role…" />
                    </SelectTrigger>
                    <SelectContent>
                      {STAFF_ROLES.filter(
                        (role) => !p.roles.some((r) => r.role === role),
                      ).map((role) => (
                        <SelectItem key={role} value={role}>
                          {ROLE_LABELS[role]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                  No people found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">
        Tip: ask a colleague to register at /auth first — they'll appear in this list, then you can
        grant them a role.
      </p>
      <div className="hidden">
        <Button variant="ghost" size="sm" disabled>
          placeholder
        </Button>
      </div>
    </div>
  );
}
