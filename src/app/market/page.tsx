import { Suspense } from "react";
import type { Metadata } from "next";
import { MarketBoard } from "@/components/market/MarketBoard";
import { BRAND, CHAIN } from "@/config/brand";
import { pricedItems } from "@/lib/server/catalog";
import { pageMeta } from "@/lib/seo";

export const revalidate = 1800;

export const metadata: Metadata = pageMeta({
  path: "/market",
  title: `Marketplace | ${BRAND.name}`,
  description: `Language models and image generation for sale on ${BRAND.name}, paid in USDG on ${CHAIN.name} and spent through an API key no wallet is attached to.`,
});

export default async function MarketPage() {
  const items = await pricedItems();
  const live = items.some((i) => i.price.live);
  return (
    <div className="wrap pt-14 md:pt-20">
      <div className="grid gap-6 md:grid-cols-[1fr_auto] md:items-end">
        <div>
          <h1 className="display">Marketplace</h1>
          <p className="lede mt-4 max-w-2xl">
            Compute an AI needs to get work done, priced in USDG and spent with a key that names no wallet. Models and images are on the shelf
            today.
          </p>
        </div>
        <p className="font-mono text-[12px] text-mute md:text-right">
          {items.filter((i) => i.status !== "planned").length} items · billed per use
        </p>
      </div>
      <div className="mt-12">
        <Suspense fallback={null}>
          <MarketBoard items={items} live={live} />
        </Suspense>
      </div>
    </div>
  );
}
