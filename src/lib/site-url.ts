/**
 * Canonical public TechNest URL used for auth redirects (email confirmation and
 * password reset). Configured via VITE_PUBLIC_APP_URL so no preview domain is
 * ever hardcoded; falls back to the current origin during development.
 */
export function publicAppUrl(): string {
  const configured = import.meta.env["VITE_PUBLIC_APP_URL"] as string | undefined;
  if (configured) return configured.replace(/\/+$/, "");
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}

export function appPath(path: string): string {
  return `${publicAppUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}
