import type { ReactNode } from "react";

export function ContentPage({
  title,
  intro,
  updated,
  children,
}: {
  title: string;
  intro?: string;
  updated?: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-14">
      <h1 className="font-display text-3xl font-bold sm:text-4xl">{title}</h1>
      {intro && <p className="mt-4 text-lg text-muted-foreground">{intro}</p>}
      {updated && (
        <p className="mt-2 text-xs uppercase tracking-[0.14em] text-muted-foreground">
          Last updated {updated}
        </p>
      )}
      <div className="mt-10 space-y-8 text-sm leading-relaxed text-muted-foreground [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-foreground [&_h3]:font-semibold [&_h3]:text-foreground [&_li]:ml-5 [&_li]:list-disc [&_p]:mt-2 [&_strong]:text-foreground [&_ul]:mt-2 [&_ul]:space-y-1">
        {children}
      </div>
    </div>
  );
}
