// Runs in the default node environment with a minimal window stub — the module
// only touches window.dataLayer, window.gtag and window.localStorage.
import { describe, expect, it, beforeEach } from "vitest";
const store = new Map<string, string>();
(globalThis as any).window = {
  dataLayer: [] as unknown[],
  localStorage: {
    clear: () => store.clear(),
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  },
};

const { track, trackOnce } = await import("@/lib/analytics");

describe("analytics conversion dedupe", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.dataLayer = [];
  });

  it("fires a conversion once per order id", () => {
    expect(trackOnce("purchase", "order-1", { value: 100 })).toBe(true);
    expect(trackOnce("purchase", "order-1", { value: 100 })).toBe(false);
    expect(window.dataLayer!.filter((e: any) => e.event === "purchase")).toHaveLength(1);
  });

  it("keeps refund and cancellation separate but each single-shot", () => {
    trackOnce("order_cancelled", "order-2");
    trackOnce("order_cancelled", "order-2");
    trackOnce("refund", "order-2");
    trackOnce("refund", "order-2");
    const events = window.dataLayer!.map((e: any) => e.event);
    expect(events).toEqual(["order_cancelled", "refund"]);
  });

  it("tags every event with ZAR currency", () => {
    track("view_item", { value: 1 });
    expect((window.dataLayer![0] as any).currency).toBe("ZAR");
  });
});
