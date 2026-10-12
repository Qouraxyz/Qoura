import { NextResponse } from "next/server";
import { CATEGORIES, MARKUP } from "@/config/catalog";
import { pricedItems } from "@/lib/server/catalog";

export const revalidate = 1800;

/** Everything for sale with its price after markup and the endpoint that serves it. Public, for agents. */
export async function GET() {
  const items = await pricedItems();
  return NextResponse.json({
    markup: MARKUP,
    currency: "USD",
    categories: CATEGORIES.map((c) => ({ id: c.key, label: c.label, live: c.live, items: items.filter((i) => i.category === c.key && i.status !== "planned").length })),
    items: items.map((i) => ({
      id: i.slug,
      name: i.name,
      maker: i.makerName,
      category: i.category,
      shelf: i.shelf,
      status: i.status ?? "on_sale",
      context: i.context ?? null,
      price: i.category === "models" ? { input_per_1m: i.price.in, output_per_1m: i.price.out } : { per_call_estimate: i.price.call },
      live_price: i.price.live,
      endpoint: i.category === "media" ? "/v1/images/generations" : i.status === "planned" ? null : "/v1/chat/completions",
    })),
  });
}
