import { NextResponse } from "next/server";
import { CREDIT_DESK, deskLive } from "@/config/contracts";
import { FACE_MAX, FACE_MIN } from "@/config/catalog";
import { encodeDeskCheckRedeem, readWord } from "@/lib/abi";
import { getStore } from "@/lib/auth/store";
import { allowPublic, readCapped, tooMany } from "@/lib/guard";
import { rpc } from "@/lib/feeds/rpc";
import { balKey, claimSpendTag, MICRO } from "@/lib/server/gateway";

export const dynamic = "force-dynamic";

/*
 * Redeem: { proof, root, face, spendTag, keyBinding }, nothing else. The desk checks the proof and
 * the root in one eth_call (checkRedeem); the spend tag is then claimed once, forever, and the key
 * whose binding is inside the proof is credited face × 1,000,000 micro-USDG. No wallet, no cookie.
 */

const HEX32 = /^0x[0-9a-fA-F]{1,64}$/;

export async function POST(request: Request) {
  if (!deskLive()) return NextResponse.json({ error: "The credit desk is not deployed yet; practice credits cannot be redeemed." }, { status: 503 });
  const store = getStore();
  if (!store) return NextResponse.json({ error: "Redeeming is not configured on this deployment yet." }, { status: 503 });
  if (!(await allowPublic(store, request, "redeem", 20, 600))) return tooMany();
  const text = await readCapped(request, 40_000).catch(() => null);
  if (text === null) return NextResponse.json({ error: "Request too large." }, { status: 413 });
  let b: { proof?: unknown; root?: unknown; face?: unknown; spendTag?: unknown; keyBinding?: unknown };
  try {
    b = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const face = Number(b.face);
  if (
    typeof b.proof !== "string" ||
    !/^0x[0-9a-fA-F]{2,20000}$/.test(b.proof) ||
    ![b.root, b.spendTag, b.keyBinding].every((v) => typeof v === "string" && HEX32.test(v)) ||
    !Number.isInteger(face) ||
    face < FACE_MIN ||
    face > FACE_MAX
  ) {
    return NextResponse.json({ error: "Malformed redeem." }, { status: 400 });
  }
  const root = BigInt(b.root as string);
  const spendTag = BigInt(b.spendTag as string);
  const keyBinding = BigInt(b.keyBinding as string);
  let valid = false;
  try {
    const out = await rpc<string>("eth_call", [{ to: CREDIT_DESK.address, data: encodeDeskCheckRedeem(b.proof, root, face, spendTag, keyBinding), gas: "0x1c9c380" }, "latest"]);
    valid = readWord(out, 0) === 1n;
  } catch {
    return NextResponse.json({ error: "The chain could not be reached to check the proof. Try again." }, { status: 502 });
  }
  if (!valid) return NextResponse.json({ error: "The proof does not check out against the credit desk." }, { status: 400 });
  if (!(await claimSpendTag(store, spendTag))) return NextResponse.json({ error: "This credit was already redeemed." }, { status: 409 });
  const balance = await store.incrBy(balKey(keyBinding), face * MICRO);
  return NextResponse.json({ ok: true, balance: String(balance) }, { headers: { "cache-control": "no-store" } });
}
