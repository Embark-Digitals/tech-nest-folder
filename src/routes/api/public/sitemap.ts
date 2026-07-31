import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const STATIC: { path: string; priority: string; changefreq: string }[] = [
  { path: "/", priority: "1.0", changefreq: "daily" },
  { path: "/shop", priority: "0.9", changefreq: "daily" },
  { path: "/about", priority: "0.5", changefreq: "yearly" },
  { path: "/contact", priority: "0.5", changefreq: "yearly" },
  { path: "/delivery", priority: "0.6", changefreq: "monthly" },
  { path: "/faq", priority: "0.6", changefreq: "monthly" },
  { path: "/returns", priority: "0.4", changefreq: "yearly" },
  { path: "/privacy", priority: "0.3", changefreq: "yearly" },
  { path: "/terms", priority: "0.3", changefreq: "yearly" },
];

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const Route = createFileRoute("/api/public/sitemap")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const origin = new URL(request.url).origin;
        const supabase = createClient<Database>(
          process.env["SUPABASE_URL"]!,
          process.env["SUPABASE_PUBLISHABLE_KEY"]!,
          { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
        );

        const [{ data: products }, { data: categories }] = await Promise.all([
          supabase
            .from("products")
            .select("slug, updated_at")
            .eq("is_published", true)
            .eq("is_discontinued", false)
            .order("updated_at", { ascending: false })
            .limit(5000),
          supabase.from("categories").select("slug, updated_at").eq("is_active", true).limit(200),
        ]);

        const urls: string[] = [
          ...STATIC.map(
            (s) =>
              `<url><loc>${origin}${s.path}</loc><changefreq>${s.changefreq}</changefreq><priority>${s.priority}</priority></url>`,
          ),
          ...(categories ?? []).map(
            (c) =>
              `<url><loc>${origin}/category/${esc(c.slug)}</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>`,
          ),
          ...(products ?? []).map(
            (p) =>
              `<url><loc>${origin}/product/${esc(p.slug)}</loc>` +
              (p.updated_at ? `<lastmod>${new Date(p.updated_at).toISOString().slice(0, 10)}</lastmod>` : "") +
              `<changefreq>weekly</changefreq><priority>0.7</priority></url>`,
          ),
        ];

        const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>`;

        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml; charset=utf-8",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
