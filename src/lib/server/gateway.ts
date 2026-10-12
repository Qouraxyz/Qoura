import "server-only";
import { NextResponse } from "next/server";
import { MARKUP, itemBySlug, type Item } from "@/config/catalog";
import { getStore, type Store } from "@/lib/auth/store";
import { isApiKey, keyBindingOf, toHex32 } from "@/lib/credit/core";
import { supplierModels } from "@/lib/server/catalog";

/*
 * The gateway's ledger. A key's balance lives under the key's binding (sha256(key) >> 8, the same
 * value its redeem proof was bound to), in micro-USDG. Before a call is served, the most it could
 * cost is held in one atomic decrement; afterwards the hold is settled to the supplier's reported
 * cost times MARKUP and the rest returned. Spend tags (one per redeemed credit) are kept forever.
 * Only counts and charges are recorded per call: never prompts, outputs or pictures.
 */

export const MICRO = 1_000_000;
/** Spend tags must outlive every root the desk remembers; ten years is "forever" for a Redis key. */
const FOREVER = 10 * 365 * 86_400;

export const balKey = (binding: bigint) => `bal:${toHex32(binding)}`;
export const usageKey = (binding: bigint) => `use:${toHex32(binding)}`;
export const spendKey = (tag: bigint) => `spent:${toHex32(tag)}`;

export type GatewayError = { status: number; message: string; type: string; code: string };

/** OpenAI-shaped error body. */
export const fail = (e: GatewayError) => NextResponse.json({ error: { message: e.message, type: e.type, code: e.code } }, { status: e.status });

export const errors = {
  noKey: { status: 401, message: "Send your key as Authorization: Bearer qk-…", type: "invalid_request_error", code: "missing_key" },
  badKey: { status: 401, message: "That is not a key this gateway issues.", type: "invalid_request_error", code: "invalid_key" },
  notConfigured: { status: 503, message: "The gateway is not configured on this deployment yet.", type: "server_error", code: "not_configured" },
  supplierDown: { status: 502, message: "The model supplier did not answer. Nothing was charged.", type: "server_error", code: "supplier_error" },
  broke: { status: 402, message: "The key's balance cannot cover this call. Redeem another credit into it.", type: "insufficient_quota", code: "insufficient_balance" },
  busy: { status: 429, message: "The gateway is at its hourly spending ceiling. Try again shortly.", type: "rate_limit_error", code: "site_ceiling" },
  unknownModel: { status: 404, message: "No item with that model id is on sale.", type: "invalid_request_error", code: "model_not_found" },
} satisfies Record<string, GatewayError>;

export function supplierKey() {
  const k = process.env.OPENROUTER_API_KEY?.trim();
  return k && k.length > 20 ? k : null;
}

/** Reads the bearer key; returns its binding or an error. */
export function bearer(request: Request): { binding: bigint } | { error: GatewayError } {
  const h = request.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(\S+)$/i.exec(h);
  if (!m) return { error: errors.noKey };
  if (!isApiKey(m[1])) return { error: errors.badKey };
  return { binding: keyBindingOf(m[1]) };
}

export function ledger(): Store | null {
  return getStore();
}

export async function balanceOf(store: Store, binding: bigint) {
  return Number((await store.get(balKey(binding))) ?? 0);
}

/** Takes `micro` from the balance if it is there; false (and nothing taken) when it is not. */
export async function hold(store: Store, binding: bigint, micro: number) {
  const after = await store.incrBy(balKey(binding), -micro);
  if (after < 0) {
    await store.incrBy(balKey(binding), micro);
    return false;
  }
  return true;
}

/**
 * Settles a hold to the real charge and records the call's counts. Returns the charge in micro-USDG.
 * The full reported cost is billed even past the hold; a balance that goes below zero refuses the next call.
 */
export async function settle(store: Store, binding: bigint, held: number, costUsd: number, record: Record<string, unknown>) {
  const charge = Math.ceil(Math.max(0, costUsd) * MARKUP * MICRO);
  if (held !== charge) await store.incrBy(balKey(binding), held - charge);
  await store.pushCapped(usageKey(binding), JSON.stringify({ at: Date.now(), charge, ...record }), 50);
  await store.incrByEx("spend:hour", charge, 3600);
  return charge;
}

/** Site-wide hourly ceiling on supplier spend (QOURA_HOURLY_USD_CAP, default $50), a guard against runaway cost. */
export async function underCeiling(store: Store) {
  const cap = Number(process.env.QOURA_HOURLY_USD_CAP || 50);
  const spent = Number((await store.get("spend:hour")) ?? 0);
  return spent < cap * MICRO;
}

/** Records a spend tag once. True when this redeem is the first for that credit. */
export async function claimSpendTag(store: Store, tag: bigint) {
  return store.setNx(spendKey(tag), String(Date.now()), FOREVER);
}

/** The item, its supplier id and the per-token prices (USD per token, before markup) for a model id. */
export async function resolveModel(id: string): Promise<{ item: Item; supplier: string; inUsd: number; outUsd: number } | null> {
  const item = itemBySlug(id) ?? null;
  if (!item || item.status === "planned" || !item.supplier) return null;
  const live = (await supplierModels())?.get(item.supplier);
  const inUsd = Number(live?.pricing?.prompt ?? (item.fallback.in ?? 0) / 1e6);
  const outUsd = Number(live?.pricing?.completion ?? (item.fallback.out ?? 0) / 1e6);
  return { item, supplier: item.supplier, inUsd: Number.isFinite(inUsd) ? inUsd : 0, outUsd: Number.isFinite(outUsd) ? outUsd : 0 };
}
