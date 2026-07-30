import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type CartLine = {
  productId: string;
  sku: string;
  name: string;
  slug: string;
  price: number;
  image: string | null;
  quantity: number;
};

type CartContextValue = {
  lines: CartLine[];
  add: (line: Omit<CartLine, "quantity">, quantity?: number) => void;
  setQuantity: (productId: string, quantity: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
  count: number;
  totalInclVat: number;
};

const CartContext = createContext<CartContextValue | null>(null);
const STORAGE_KEY = "technest.cart.v1";

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setLines(JSON.parse(raw));
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
  }, [lines, hydrated]);

  const value = useMemo<CartContextValue>(() => {
    const totalInclVat = lines.reduce((sum, l) => sum + l.price * l.quantity, 0);
    return {
      lines,
      count: lines.reduce((sum, l) => sum + l.quantity, 0),
      totalInclVat,
      add: (line, quantity = 1) =>
        setLines((prev) => {
          const existing = prev.find((l) => l.productId === line.productId);
          if (existing) {
            return prev.map((l) =>
              l.productId === line.productId ? { ...l, quantity: l.quantity + quantity } : l,
            );
          }
          return [...prev, { ...line, quantity }];
        }),
      setQuantity: (productId, quantity) =>
        setLines((prev) =>
          quantity <= 0
            ? prev.filter((l) => l.productId !== productId)
            : prev.map((l) => (l.productId === productId ? { ...l, quantity } : l)),
        ),
      remove: (productId) => setLines((prev) => prev.filter((l) => l.productId !== productId)),
      clear: () => setLines([]),
    };
  }, [lines]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
