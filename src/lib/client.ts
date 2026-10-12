import { CHAIN } from "@/config/brand";
import { REVERTS, decodeStringAt, encodeBalanceOf, wordAt } from "@/lib/calls";

/*
 * Browser-side reads and helpers. Reads go through the site relay first (some networks intercept the
 * chain's public RPC host), then the configured RPC, then the public fallback.
 */

const ENDPOINTS = ["/api/rpc", CHAIN.rpc, CHAIN.fallbackRpc].filter((u, i, all) => all.indexOf(u) === i);

export class ChainError extends Error {
  constructor(message: string, readonly data: string | null = null, readonly final = false) {
    super(message);
  }
}

/** One JSON-RPC call with endpoint fallback. A revert or a refused transaction is final (not retried elsewhere). */
export async function call<T>(method: string, params: unknown[]): Promise<T> {
  let last: unknown = null;
  for (const url of ENDPOINTS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        cache: "no-store",
      });
      const body = (await res.json().catch(() => null)) as { result?: T; error?: { message?: string; data?: unknown; code?: number } | string } | null;
      if (!body) throw new Error(`RPC ${res.status}`);
      if (typeof body.error === "string") throw new Error(body.error); // relay refused the shape; try the next endpoint
      if (body.error) {
        const e = body.error;
        const data = typeof e.data === "string" ? e.data : e.data && typeof (e.data as { data?: unknown }).data === "string" ? (e.data as { data: string }).data : null;
        const final = e.code === 3 || /revert|nonce|insufficient|underpriced|already known|intrinsic/i.test(e.message ?? "");
        if (final) throw new ChainError(e.message ?? "Refused", data, true);
        throw new ChainError(e.message ?? "RPC error", data);
      }
      return body.result as T;
    } catch (error) {
      if (error instanceof ChainError && error.final) throw error;
      last = error;
    }
  }
  throw last instanceof Error ? last : new Error("The chain could not be reached.");
}

export const ethCall = (to: string, data: string, from?: string) => call<string>("eth_call", [{ to, data, ...(from ? { from } : {}) }, "latest"]);

/** Turns revert data or a node message into a sentence. */
export function explain(error: unknown, fallback = "The transaction would fail.") {
  if (error instanceof ChainError && error.data && error.data.length >= 10) {
    const known = REVERTS[error.data.slice(0, 10).toLowerCase()];
    if (known) return known;
    if (error.data.startsWith("0x08c379a0")) {
      try {
        return `Refused: ${decodeStringAt(`0x${error.data.slice(10)}`)}`;
      } catch {
        // fall through
      }
    }
  }
  const msg = error instanceof Error ? error.message : "";
  if (/insufficient funds/i.test(msg)) return "Not enough ETH for the amount plus the network fee.";
  if (/user rejected|denied|rejected the request/i.test(msg)) return "You declined in the wallet. Nothing was sent.";
  return msg && msg.length < 200 ? msg : fallback;
}

/** Dry run of a transaction from `from`, so a refusal is explained before the wallet asks. */
export async function simulate(tx: { from: string; to?: string; data?: string; value?: bigint }) {
  await call<string>("eth_call", [
    { from: tx.from, ...(tx.to ? { to: tx.to } : {}), data: tx.data ?? "0x", ...(tx.value ? { value: `0x${tx.value.toString(16)}` } : {}) },
    "latest",
  ]);
}

export type Receipt = { status: string; blockNumber: string; contractAddress: string | null; transactionHash: string };

export async function waitReceipt(hash: string, timeoutMs = 120_000): Promise<Receipt> {
  const start = Date.now();
  for (;;) {
    const r = await call<Receipt | null>("eth_getTransactionReceipt", [hash]).catch(() => null);
    if (r && r.blockNumber) {
      if (r.status !== "0x1") throw new Error("The transaction was included but reverted. Nothing moved.");
      return r;
    }
    if (Date.now() - start > timeoutMs) throw new Error("No receipt yet. Check the transaction on the explorer.");
    await new Promise((ok) => setTimeout(ok, 1_200));
  }
}

export const txUrl = (hash: string) => `${CHAIN.explorer}/tx/${hash}`;
export const addressUrl = (a: string) => `${CHAIN.explorer}/address/${a}`;

export async function tokenBalance(token: string, owner: string) {
  return wordAt(await ethCall(token, encodeBalanceOf(owner)), 0);
}

export async function ethBalance(owner: string) {
  return BigInt(await call<string>("eth_getBalance", [owner, "latest"]));
}

export function parseUnits(text: string, decimals: number): bigint | null {
  const t = text.trim();
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const [whole, frac = ""] = t.split(".");
  if (frac.length > decimals) return null;
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt((frac + "0".repeat(decimals)).slice(0, decimals) || "0");
}

export function formatUnits(value: bigint, decimals: number, digits = 6) {
  const neg = value < 0n;
  const v = neg ? -value : value;
  const base = 10n ** BigInt(decimals);
  const whole = v / base;
  const frac = (v % base).toString().padStart(decimals, "0").slice(0, digits).replace(/0+$/, "");
  return `${neg ? "-" : ""}${whole.toLocaleString("en-US")}${frac ? `.${frac}` : ""}`;
}
