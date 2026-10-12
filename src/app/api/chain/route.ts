import { NextResponse } from "next/server";
import { BRAND, isAddress } from "@/config/brand";
import { FACES } from "@/config/catalog";
import { CREDIT_DESK, deskLive } from "@/config/contracts";
import { DESK_SIG, encodeDeskFaceCount } from "@/lib/abi";
import { decodeStringAt } from "@/lib/calls";
import { rpcBatch } from "@/lib/feeds/rpc";
import { ticker } from "@/lib/feeds/okx";

export const dynamic = "force-dynamic";

/*
 * Live facts for the whole site: latest Robinhood Chain block and gas, ETH/USD (OKX spot), and, once
 * the credit desk is deployed, how many credits it has sold, per face value, and the tree's root.
 * The token's on-chain name and supply join once the contract address is published. Every number is
 * read, none is typed in.
 */

export type ChainSnapshot = {
  at: number;
  block: number | null;
  blockTime: number | null;
  gasGwei: number | null;
  ethUsd: number | null;
  desk: { live: boolean; credits: number | null; root: string | null; crowds: Record<string, number> };
  token: { name: string | null; symbol: string | null; supply: string | null; decimals: number | null } | null;
};

let cache: { at: number; value: ChainSnapshot } | null = null;
const TTL = 12_000;

async function read(): Promise<ChainSnapshot> {
  const ca = isAddress(BRAND.ca) ? BRAND.ca : null;
  const live = deskLive();
  const calls: { method: string; params: unknown[] }[] = [
    { method: "eth_getBlockByNumber", params: ["latest", false] },
    { method: "eth_gasPrice", params: [] },
  ];
  const at = (data: string, to: string) => ({ method: "eth_call", params: [{ to, data }, "latest"] });
  if (live) {
    calls.push(at(DESK_SIG.nextIndex, CREDIT_DESK.address), at(DESK_SIG.currentRoot, CREDIT_DESK.address));
    for (const f of FACES) calls.push(at(encodeDeskFaceCount(f), CREDIT_DESK.address));
  }
  if (ca) for (const data of ["0x06fdde03", "0x95d89b41", "0x18160ddd", "0x313ce567"]) calls.push(at(data, ca));

  const [results, eth] = await Promise.all([
    rpcBatch<string | { number: string; timestamp: string }>(calls).catch(() => calls.map(() => null)),
    ticker("ETH-USDT").catch(() => null),
  ]);
  const block = results[0] && typeof results[0] === "object" ? results[0] : null;
  const gas = typeof results[1] === "string" ? results[1] : null;
  const str = (v: unknown) => (typeof v === "string" && v.length > 2 ? v : null);
  let i = 2;
  const desk: ChainSnapshot["desk"] = { live, credits: null, root: null, crowds: {} };
  if (live) {
    const n = str(results[i++]);
    const r = str(results[i++]);
    desk.credits = n ? Number(BigInt(n)) : null;
    desk.root = r ? `0x${BigInt(r).toString(16).padStart(64, "0")}` : null;
    for (const f of FACES) {
      const c = str(results[i++]);
      if (c) desk.crowds[String(f)] = Number(BigInt(c));
    }
  }
  let token: ChainSnapshot["token"] = null;
  if (ca) {
    const [n, s, sup, dec] = [str(results[i]), str(results[i + 1]), str(results[i + 2]), str(results[i + 3])];
    token = {
      name: n ? decodeStringAt(n) : null,
      symbol: s ? decodeStringAt(s) : null,
      supply: sup ? BigInt(sup).toString() : null,
      decimals: dec ? Number(BigInt(dec)) : null,
    };
  }
  return {
    at: Date.now(),
    block: block ? Number(BigInt(block.number)) : null,
    blockTime: block ? Number(BigInt(block.timestamp)) : null,
    gasGwei: gas ? Number(BigInt(gas)) / 1e9 : null,
    ethUsd: eth?.last ?? null,
    desk,
    token,
  };
}

export async function GET() {
  if (!cache || Date.now() - cache.at > TTL) {
    const value = await read();
    // A failed read does not replace a good one that is still recent.
    if (value.block !== null || !cache || Date.now() - cache.at > 120_000) cache = { at: Date.now(), value };
  }
  return NextResponse.json(cache.value, { headers: { "cache-control": "no-store" } });
}
