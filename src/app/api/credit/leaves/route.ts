import { NextResponse } from "next/server";
import { allowPublic, tooMany } from "@/lib/guard";
import { getStore } from "@/lib/auth/store";
import { creditLeaves } from "@/lib/server/leafIndex";

export const dynamic = "force-dynamic";

const PAGE = 5_000;

/** Every credit leaf in order, 5,000 per page from ?from=N. Public: anyone can rebuild the root. */
export async function GET(request: Request) {
  const store = getStore();
  if (store && !(await allowPublic(store, request, "leaves", 120, 2_000))) return tooMany();
  const from = Math.max(0, Math.floor(Number(new URL(request.url).searchParams.get("from") ?? 0)) || 0);
  const { configured, leaves, scanned } = await creditLeaves();
  return NextResponse.json(
    { configured, total: leaves.length, scannedTo: scanned, leaves: leaves.slice(from, from + PAGE) },
    { headers: { "cache-control": "no-store" } },
  );
}
