import type { Store } from "@/lib/auth/store";
import { DIRECT, aggregateKey, isAggregate } from "@/lib/netkey";

/*
 * Fixed-window counters.
 *
 * With a store (Redis in production) every counter is a store key with its
 * own TTL, shared by all server instances. If the store fails, the request is
 * refused: the routes behind these limits need the store anyway.
 *
 * Without any store (a local run, or the RPC relay deployed without Redis)
 * counters live in this process: per instance and best-effort. Memory has a
 * hard cap: 80% for leaf keys, 20% for pinned entries (aggregates and
 * "direct") in a separate map. Pinned entries are never evicted inside their
 * window; leaves are, lowest count among the oldest first, so evicting a leaf
 * never resets an aggregate. When the pinned map is full a new aggregate is
 * not tracked for that window and only the leaf limit applies. Every step is
 * O(sample).
 */

const SHARED_FACTOR = 20; // "direct" stands for every visitor at once
const AGGREGATE_FACTOR = 16; // a /24 or /48 may hold many legitimate users
export const MEMORY_KEYS = 10_000;
const SAMPLE = 64;

type Entry = { n: number; until: number };
/** Pinned entries (aggregates and "direct") live in their own map, capped at 20% of the total. */
export const PINNED_KEYS = Math.floor(MEMORY_KEYS * 0.2);
const LEAF_KEYS = MEMORY_KEYS - PINNED_KEYS;
const leaves = new Map<string, Entry>();
const pinnedMap = new Map<string, Entry>();
export const memorySize = () => leaves.size + pinnedMap.size;

/** Drops the expired entries among the oldest SAMPLE of a map. O(SAMPLE). */
function sweep(map: Map<string, Entry>, now: number) {
  let i = 0;
  for (const [k, e] of map) {
    if (i++ >= SAMPLE) break;
    if (e.until < now) map.delete(k);
  }
}

/** Frees one leaf slot: expired first, else the lowest count among the oldest SAMPLE leaves. O(SAMPLE). */
function makeLeafRoom(now: number) {
  sweep(leaves, now);
  if (leaves.size < LEAF_KEYS) return;
  let victim: string | null = null;
  let low = Infinity;
  let i = 0;
  for (const [k, e] of leaves) {
    if (i++ >= SAMPLE) break;
    if (e.n < low) {
      victim = k;
      low = e.n;
    }
  }
  if (victim !== null) leaves.delete(victim);
}

/**
 * Adds to an in-memory counter. A leaf always gets a slot (the leaf map only
 * holds evictable entries). A pinned entry is never evicted inside its
 * window; when the pinned map is full a new pinned key is not tracked and
 * null is returned, so its check is skipped for this window.
 */
function memoryAdd(k: string, units: number, windowSec: number, pinned: boolean): number | null {
  const now = Date.now();
  const map = pinned ? pinnedMap : leaves;
  const hit = map.get(k);
  if (hit && hit.until > now) {
    hit.n += units;
    return hit.n;
  }
  if (!hit) {
    if (pinned) {
      if (pinnedMap.size >= PINNED_KEYS) sweep(pinnedMap, now);
      if (pinnedMap.size >= PINNED_KEYS) return null;
    } else if (leaves.size >= LEAF_KEYS) makeLeafRoom(now);
  }
  map.set(k, { n: units, until: now + windowSec * 1000 });
  return units;
}

/**
 * Adds units to one counter. With a store, the store is the only source of
 * truth: if it fails the request is refused (fail closed). Memory counts only
 * when no store is configured at all.
 */
async function add(store: Store | null, k: string, units: number, windowSec: number, pinned: boolean): Promise<number | null> {
  if (store) {
    try {
      return await store.incrByEx(k, units, windowSec + 5);
    } catch {
      return Infinity;
    }
  }
  return memoryAdd(k, units, windowSec, pinned);
}

export type SpendOptions = {
  /** Also charge the /24 or /48 aggregate (cost and abuse buckets only, never verified-wallet limits). */
  aggregate?: boolean;
};

/** Adds `units` to the caller's window; true while every counter stays within budget. */
export async function spend(store: Store | null, bucket: string, key: string, units: number, max: number, windowSec: number, opts: SpendOptions = {}) {
  const slot = Math.floor(Date.now() / 1000 / windowSec);
  const own = key === DIRECT ? max * SHARED_FACTOR : max;
  const leaf = await add(store, `rl:${bucket}:${key}:${slot}`, units, windowSec, isAggregate(key));
  // "direct" is pinned; if memory could not track it, it is refused, never let through.
  let ok = leaf !== null && leaf <= own;
  const agg = opts.aggregate ? aggregateKey(key) : null;
  if (agg) {
    const wide = await add(store, `rl:${bucket}:${agg}:${slot}`, units, windowSec, true);
    // An aggregate that memory could not track this window is skipped; the leaf limit still applies.
    if (wide !== null) ok = ok && wide <= max * AGGREGATE_FACTOR;
  }
  return ok;
}
