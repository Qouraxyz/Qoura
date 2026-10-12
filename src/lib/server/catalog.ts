import "server-only";
import { ITEMS, MARKUP, type Item } from "@/config/catalog";

/*
 * Live supplier prices. The OpenRouter model list is public (no key) and carries per-token prices;
 * we read it at most once every 30 minutes and multiply by MARKUP. When it cannot be read, the
 * catalog's fallback prices are shown and `live` is false so the page can say so.
 */

export type Price = {
  /** USD per 1M input / output tokens, after markup (models). */
  in?: number;
  out?: number;
  /** USD per call, after markup (images, web data); an estimate, the real charge follows the call. */
  call?: number;
  live: boolean;
};

type SupplierModel = { id: string; context_length?: number; pricing?: Record<string, string> };

const TTL = 30 * 60_000;
/** Output tokens one generated picture is billed as by the image suppliers we list. */
const IMAGE_TOKENS = 1290;
/** Web results a web answer pulls in, at the supplier's price per result. */
const WEB_RESULTS = 5;
const WEB_RESULT_USD = 0.004;
/** Tokens a typical web answer reads and writes. */
const WEB_ANSWER_TOKENS = { in: 6000, out: 400 };

let cache: { at: number; byId: Map<string, SupplierModel> } | null = null;
let inflight: Promise<Map<string, SupplierModel> | null> | null = null;

async function load(): Promise<Map<string, SupplierModel> | null> {
  try {
    const res = await fetch("https://openrouter.ai/api/v1/models", {
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 1800 },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: SupplierModel[] };
    if (!Array.isArray(json.data)) return null;
    return new Map(json.data.map((m) => [m.id, m]));
  } catch {
    return null;
  }
}

export async function supplierModels(): Promise<Map<string, SupplierModel> | null> {
  if (cache && Date.now() - cache.at < TTL) return cache.byId;
  if (!inflight) {
    inflight = load().finally(() => {
      inflight = null;
    });
  }
  const byId = await inflight;
  // A failed read never replaces a good one, so one bad minute does not blank the shelves.
  if (byId) cache = { at: Date.now(), byId };
  return byId ?? cache?.byId ?? null;
}

const num = (v: string | undefined) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

export function priceFrom(item: Item, model: SupplierModel | undefined): Price {
  const p = model?.pricing;
  if (item.category === "models") {
    const i = num(p?.prompt);
    const o = num(p?.completion);
    if (i !== null && o !== null) return { in: i * 1e6 * MARKUP, out: o * 1e6 * MARKUP, live: true };
    return { in: (item.fallback.in ?? 0) * MARKUP, out: (item.fallback.out ?? 0) * MARKUP, live: false };
  }
  if (item.category === "media") {
    const img = num(p?.image_output);
    if (img !== null && img > 0) return { call: img * IMAGE_TOKENS * MARKUP, live: true };
    return { call: (item.fallback.call ?? 0) * MARKUP, live: false };
  }
  if (item.category === "search" && item.supplier) {
    const i = num(p?.prompt);
    const o = num(p?.completion);
    if (i !== null && o !== null) {
      const usd = WEB_RESULTS * WEB_RESULT_USD + i * WEB_ANSWER_TOKENS.in + o * WEB_ANSWER_TOKENS.out;
      return { call: usd * MARKUP, live: true };
    }
  }
  return { call: (item.fallback.call ?? 0) * MARKUP, live: false };
}

export type PricedItem = Item & { price: Price; context?: number };

export async function pricedItems(): Promise<PricedItem[]> {
  const byId = await supplierModels();
  return ITEMS.map((item) => {
    const model = item.supplier ? byId?.get(item.supplier) : undefined;
    return { ...item, context: item.context ?? model?.context_length, price: priceFrom(item, model) };
  });
}

export async function pricedItem(slug: string): Promise<PricedItem | null> {
  return (await pricedItems()).find((i) => i.slug === slug) ?? null;
}
