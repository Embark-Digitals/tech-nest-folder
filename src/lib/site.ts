/**
 * Public site URL used for canonical and og:url tags.
 *
 * Configurable: set VITE_PUBLIC_SITE_URL to the production domain when a
 * custom domain is connected. The fallback is the published Lovable domain —
 * never the ephemeral `id-preview--*` editor domain, which must not become the
 * permanent canonical host.
 */
const configured = (import.meta.env["VITE_PUBLIC_SITE_URL"] ??
  import.meta.env["VITE_PUBLIC_APP_URL"]) as string | undefined;

export const SITE_URL = (configured?.trim() || "https://digital-nesting-ground.lovable.app").replace(
  /\/+$/,
  "",
);

export function canonicalUrl(path: string) {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/** meta + links entries that self-reference the given path. */
export function canonicalHead(path: string) {
  const url = canonicalUrl(path);
  return {
    meta: { property: "og:url", content: url } as const,
    link: { rel: "canonical", href: url } as const,
  };
}

/** Head fragment for private routes that must never be indexed. */
export const noindexMeta = { name: "robots", content: "noindex, nofollow" } as const;
