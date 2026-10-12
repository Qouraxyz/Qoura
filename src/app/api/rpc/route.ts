import { NextResponse } from "next/server";
import { readCapped } from "@/lib/guard";
import { getStore } from "@/lib/auth/store";
import { RpcError, rpc, rpcBatch } from "@/lib/feeds/rpc";
import { clientIp, trustsProxyHeaders } from "@/lib/netkey";
import { spend } from "@/lib/ratelimit";
import { BUDGET, MAX_BODY, runRelay, type Call } from "@/lib/relay";

export const dynamic = "force-dynamic";

/*
 * JSON-RPC relay for the browser. Some networks intercept the chain's public RPC host, so the site
 * reads through its own server first: read methods for the contracts the site reads and gas estimates.
 * It never forwards a signed transaction. A cost budget per network (IPv6 per /64) and a site-wide
 * ceiling keep the RPC quota safe.
 * The rules are in src/lib/relay.ts; nothing reaches the RPC before they pass.
 */
export async function POST(request: Request) {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY) return NextResponse.json({ error: "Request too large." }, { status: 413 });
  const text = await readCapped(request, MAX_BODY).catch(() => "");
  if (text === null) return NextResponse.json({ error: "Request too large." }, { status: 413 });
  let body: Call | Call[];
  try {
    body = JSON.parse(text) as Call | Call[];
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const store = getStore();
  const ip = clientIp(request);
  const out = await runRelay(body, {
    charge: async (units) => {
      if (!(await spend(store, "rpc", ip, units, BUDGET.units, BUDGET.windowSec, { aggregate: true }))) return "Too many chain reads from your network. Slow down a little.";
      // Without trusted proxy headers everyone shares one key; a site-wide ceiling applies too.
      if (!trustsProxyHeaders() && !(await spend(store, "rpc-site", "all", units, BUDGET.siteUnits, BUDGET.windowSec))) return "The relay is busy. Try again shortly.";
      return null;
    },
    one: async (method, params) => {
      try {
        return { result: await rpc<unknown>(method, params) };
      } catch (error) {
        if (error instanceof RpcError) return { error: { code: error.revert ? 3 : -32000, message: error.message.slice(0, 300), ...(error.data ? { data: error.data } : {}) } };
        return { down: true };
      }
    },
    many: (calls) => rpcBatch<unknown>(calls),
  });
  return NextResponse.json(out.body, { status: out.status, headers: { "cache-control": "no-store" } });
}
