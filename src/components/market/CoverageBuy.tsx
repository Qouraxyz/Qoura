"use client";

import { BuyPanel } from "@/components/market/BuyPanel";
import type { CategoryKey } from "@/config/catalog";

const tokens = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : `${Math.round(n / 1000)}K`);

/** Buy panel with a line on what the chosen face value buys on this item. */
export function CoverageBuy({ name, category, out, call }: { name: string; category: CategoryKey; out: number; call: number }) {
  const coverage = (face: number) => {
    if (category === "models" && out > 0) return `$${face} buys roughly ${tokens((face / out) * 1e6)} tokens of ${name} output, and works on any other listing as well.`;
    if (call > 0) return `$${face} buys roughly ${Math.floor(face / call).toLocaleString("en-US")} ${category === "media" ? "pictures" : "answers"} from ${name}, and works on any other listing as well.`;
    return "The credit spends on every item in the marketplace.";
  };
  return <BuyPanel coverage={coverage} />;
}
