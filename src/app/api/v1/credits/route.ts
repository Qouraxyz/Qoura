import { NextResponse } from "next/server";
import { CHAIN, USDG } from "@/config/brand";
import { FACES, FACE_MAX, FACE_MIN } from "@/config/catalog";
import { CREDIT_DESK, TREE_DEPTH, deskLive } from "@/config/contracts";
import { creditLeaves } from "@/lib/server/leafIndex";

export const dynamic = "force-dynamic";

/** The amounts on sale, the crowd at each amount, the payment chain and asset, and the tree's size. */
export async function GET() {
  const { configured, leaves } = await creditLeaves();
  const crowds: Record<string, number> = {};
  for (const l of leaves) crowds[String(l.face)] = (crowds[String(l.face)] ?? 0) + 1;
  return NextResponse.json(
    {
      live: configured && deskLive(),
      desk: CREDIT_DESK.address || null,
      chain: { id: CHAIN.id, name: CHAIN.name },
      asset: { symbol: USDG.symbol, address: USDG.address, decimals: USDG.decimals },
      faces: { offered: FACES, min: FACE_MIN, max: FACE_MAX },
      tree: { depth: TREE_DEPTH, size: leaves.length, leaves: "/api/credit/leaves" },
      crowds,
      prover: { circuit: "/zk/redeem.json", worker: "/zk/prover.js" },
    },
    { headers: { "cache-control": "no-store" } },
  );
}
