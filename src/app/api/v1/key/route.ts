import { NextResponse } from "next/server";
import { balanceOf, bearer, errors, fail, ledger, usageKey } from "@/lib/server/gateway";

export const dynamic = "force-dynamic";

/** The balance of the key in the Authorization header and its last calls (counts and charges only). */
export async function GET(request: Request) {
  const who = bearer(request);
  if ("error" in who) return fail(who.error);
  const store = ledger();
  if (!store) return fail(errors.notConfigured);
  const [micro, recent] = await Promise.all([balanceOf(store, who.binding), store.range(usageKey(who.binding), 50)]);
  return NextResponse.json(
    { balance_usd: micro / 1_000_000, balance_micro: micro, recent: recent.map((r) => JSON.parse(r)) },
    { headers: { "cache-control": "no-store" } },
  );
}
