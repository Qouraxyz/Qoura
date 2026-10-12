import { BRAND, USDG, WETH, isAddress } from "@/config/brand";
import { CREDIT_DESK } from "@/config/contracts";

/*
 * Rules for the read-only JSON-RPC relay, kept apart from the route so they
 * can be tested. Every request is priced in units; each network has a budget.
 */

export const MAX_CALLS = 20;
export const MAX_LOGS_PER_BATCH = 3;
export const MAX_LOG_SPAN = 20_000;
export const MAX_GAS = 5_000_000;
export const MAX_BODY = 32_768;
export const BUDGET = { units: 600, windowSec: 600, siteUnits: 20_000 };

export const COST: Record<string, number> = {
  eth_getLogs: 10,
  eth_call: 2,
  eth_getTransactionReceipt: 1,
  eth_blockNumber: 1,
  eth_getBalance: 1,
  eth_chainId: 1,
  eth_gasPrice: 1,
  eth_getBlockByNumber: 1,
  eth_getTransactionCount: 1,
  eth_maxPriorityFeePerGas: 1,
  eth_getCode: 1,
  eth_estimateGas: 3,
};

/** Call data limit in hex characters (a redeem check carries an ~8.4 KB proof). */
export const MAX_CALL_DATA = 20_000;
const dataLimit = (to: unknown) => (typeof to === "string" ? MAX_CALL_DATA : 0);

/** Contracts the site itself reads. Anything else goes to the public RPC directly from the browser. */
export function readTargets() {
  const list: string[] = [USDG.address, WETH];
  if (isAddress(BRAND.ca)) list.push(BRAND.ca);
  if (CREDIT_DESK.address) list.push(CREDIT_DESK.address);
  return new Set(list.map((a) => a.toLowerCase()));
}

export type Call = { jsonrpc?: string; id?: unknown; method: string; params?: unknown[] };

const hexBlock = (v: unknown) => (typeof v === "string" && /^0x[0-9a-fA-F]{1,16}$/.test(v) ? Number(BigInt(v)) : null);

/** Checks a batch and returns its cost in units, or the reason it is refused. */
export function checkBatch(calls: Call[], targets = readTargets()): { units: number } | { error: string } {
  if (calls.length === 0 || calls.length > MAX_CALLS) return { error: `Between 1 and ${MAX_CALLS} calls per request.` };
  let units = 0;
  let logs = 0;
  let span = 0;
  for (let i = 0; i < calls.length; i++) {
    const c = calls[i];
    if (!c || typeof c.method !== "string" || !(c.method in COST)) return { error: `Method not allowed: ${String(c?.method)}` };
    if (c.params !== undefined && !Array.isArray(c.params)) return { error: "params must be an array." };
    const params = c.params ?? [];
    units += COST[c.method];
    if (c.method === "eth_getLogs") {
      logs += 1;
      if (logs > MAX_LOGS_PER_BATCH) return { error: `At most ${MAX_LOGS_PER_BATCH} log queries per request.` };
      const filter = (params[0] ?? {}) as { address?: unknown; fromBlock?: unknown; toBlock?: unknown; blockHash?: unknown };
      if (filter.blockHash !== undefined) return { error: "blockHash filters are not relayed." };
      // An address filter is required and every address must be one the site reads: a topic-only or
      // address-less query would return every log on the chain in the range.
      const addresses = typeof filter.address === "string" ? [filter.address] : Array.isArray(filter.address) ? filter.address : null;
      if (!addresses || addresses.length === 0 || addresses.length > 3) return { error: "eth_getLogs needs an address filter (1 to 3 addresses)." };
      if (!addresses.every((a) => typeof a === "string" && targets.has(a.toLowerCase()))) return { error: "eth_getLogs address not served by this relay." };
      // Both ends must be hex numbers: "latest" or a missing bound would let one request scan the whole chain.
      const from = hexBlock(filter.fromBlock);
      const to = hexBlock(filter.toBlock);
      if (from === null || to === null) return { error: "eth_getLogs needs numeric fromBlock and toBlock." };
      if (to < from) return { error: "toBlock is before fromBlock." };
      span += to - from + 1;
      if (span > MAX_LOG_SPAN) return { error: "Log range too wide." };
      // Priced by the blocks it covers: 1 extra unit per 1,000 blocks.
      units += Math.ceil((to - from + 1) / 1_000);
    }
    if (c.method === "eth_call") {
      if (params.length > 2) return { error: "State overrides are not relayed." };
      const tx = params[0] as { to?: unknown; gas?: unknown; data?: unknown } | undefined;
      if (!tx || typeof tx.to !== "string" || !targets.has(tx.to.toLowerCase())) return { error: "eth_call target not served by this relay." };
      if (tx.gas !== undefined) {
        const gas = typeof tx.gas === "string" && /^0x[0-9a-fA-F]{1,16}$/.test(tx.gas) ? Number(BigInt(tx.gas)) : Infinity;
        if (gas > MAX_GAS) return { error: "Gas above the relay cap." };
      }
      if (typeof tx.data === "string" && tx.data.length > dataLimit(tx.to)) return { error: "Call data too large." };
    }
    if (c.method === "eth_getBlockByNumber" && params[1] !== false) return { error: "eth_getBlockByNumber is relayed only with full transactions off (false)." };
    if (c.method === "eth_estimateGas") {
      if (params.length > 2) return { error: "State overrides are not relayed." };
      const tx = params[0] as { to?: unknown; gas?: unknown; data?: unknown } | undefined;
      if (!tx || typeof tx !== "object") return { error: "eth_estimateGas needs a transaction." };
      if (tx.gas !== undefined) {
        const gas = typeof tx.gas === "string" && /^0x[0-9a-fA-F]{1,16}$/.test(tx.gas) ? Number(BigInt(tx.gas)) : Infinity;
        if (gas > MAX_GAS) return { error: "Gas above the relay cap." };
      }
      if (typeof tx.data === "string" && tx.data.length > dataLimit(tx.to)) return { error: "Call data too large." };
    }
  }
  return { units };
}

export type RpcAnswer = { result: unknown } | { error: { code: number; message: string; data?: string } } | { down: true };

export type RelayDeps = {
  /** Charges the caller's budgets; returns the refusal message, or null when allowed. */
  charge: (units: number) => Promise<string | null>;
  one: (method: string, params: unknown[]) => Promise<RpcAnswer>;
  many: (calls: { method: string; params: unknown[] }[]) => Promise<(unknown | null)[]>;
};

/**
 * The relay's whole decision, without I/O of its own: shape and price first, then the budget, then
 * the target allowlist, and only then the upstream RPC. A refused request never reaches the RPC.
 */
export async function runRelay(body: Call | Call[], deps: RelayDeps): Promise<{ status: number; body: unknown }> {
  const calls = Array.isArray(body) ? body : [body];
  const targets = readTargets();
  // First pass with every call target allowed, only to price the request and check its shape.
  const callTargets = calls.flatMap((c) => {
    const to = c?.method === "eth_call" && Array.isArray(c.params) ? (c.params[0] as { to?: unknown } | undefined)?.to : undefined;
    return typeof to === "string" ? [to.toLowerCase()] : [];
  });
  const priced = checkBatch(calls, new Set([...targets, ...callTargets]));
  if ("error" in priced) return { status: 400, body: { error: priced.error } };
  const refused = await deps.charge(priced.units);
  if (refused) return { status: 429, body: { error: refused } };
  const checked = checkBatch(calls, targets);
  if ("error" in checked) return { status: 400, body: { error: checked.error } };
  if (calls.length === 1 && !Array.isArray(body)) {
    const c = calls[0];
    const a = await deps.one(c.method, c.params ?? []);
    if ("down" in a) return { status: 502, body: { error: "The chain could not be reached." } };
    return { status: 200, body: { jsonrpc: "2.0", id: c.id ?? null, ...a } };
  }
  try {
    const results = await deps.many(calls.map((c) => ({ method: c.method, params: c.params ?? [] })));
    const out = calls.map((c, i) =>
      results[i] === null ? { jsonrpc: "2.0", id: c.id ?? null, error: { code: -32000, message: "read failed" } } : { jsonrpc: "2.0", id: c.id ?? null, result: results[i] },
    );
    return { status: 200, body: Array.isArray(body) ? out : out[0] };
  } catch {
    return { status: 502, body: { error: "The chain could not be reached." } };
  }
}
