import { NextResponse } from "next/server";
import { CREDIT_DESK, deskLive } from "@/config/contracts";
import { FACE_MAX, FACE_MIN } from "@/config/catalog";
import { encodeDeskBuyWithAuthorization } from "@/lib/abi";
import { getStore } from "@/lib/auth/store";
import { allow, allowPublic, readCapped, tooMany } from "@/lib/guard";
import { RpcError, rpc } from "@/lib/feeds/rpc";
import { walletKey } from "@/lib/netkey";
import { REVERTS } from "@/lib/calls";
import { addressOf, relayerKey, signTx } from "@/lib/server/signer";

export const dynamic = "force-dynamic";

/*
 * Gasless purchase: the buyer signed a USDG ReceiveWithAuthorization whose nonce binds it to one
 * commitment and face value; the relayer wallet (QOURA_RELAYER_KEY) pays the gas for
 * buyWithAuthorization. The calldata is rebuilt here from the fields, never taken from the body, the
 * call is simulated first, and only the desk can be called. Per network and per paying wallet daily
 * caps bound the gas the relayer spends.
 */

const ADDR = /^0x[0-9a-fA-F]{40}$/;
const HEX32 = /^0x[0-9a-fA-F]{64}$/;
const UINT = /^\d{1,78}$/;
const GAS_CAP = 1_400_000n;

export async function POST(request: Request) {
  if (!deskLive()) return NextResponse.json({ error: "The credit desk is not deployed yet." }, { status: 503 });
  const key = relayerKey();
  const store = getStore();
  if (!key || !store) return NextResponse.json({ error: "The gasless relayer is not configured on this deployment." }, { status: 503 });
  if (!(await allowPublic(store, request, "relay", 6, 120))) return tooMany();

  const text = await readCapped(request, 4_096).catch(() => null);
  if (text === null) return NextResponse.json({ error: "Request too large." }, { status: 413 });
  let b: Record<string, unknown>;
  try {
    b = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const face = Number(b.face);
  const v = Number(b.v);
  if (
    typeof b.commitment !== "string" ||
    !HEX32.test(b.commitment) ||
    !Number.isInteger(face) ||
    face < FACE_MIN ||
    face > FACE_MAX ||
    typeof b.from !== "string" ||
    !ADDR.test(b.from) ||
    ![b.value, b.validAfter, b.validBefore].every((x) => typeof x === "string" && UINT.test(x)) ||
    !(v === 27 || v === 28) ||
    typeof b.r !== "string" ||
    !HEX32.test(b.r) ||
    typeof b.s !== "string" ||
    !HEX32.test(b.s)
  ) {
    return NextResponse.json({ error: "Malformed authorization." }, { status: 400 });
  }
  if (!(await allow(store, "relay-wallet", [walletKey(b.from)], 20, 86_400))) return NextResponse.json({ error: "Daily limit of gasless purchases for this wallet reached." }, { status: 429 });

  const data = encodeDeskBuyWithAuthorization({
    commitment: BigInt(b.commitment),
    face,
    from: b.from,
    value: BigInt(b.value as string),
    validAfter: BigInt(b.validAfter as string),
    validBefore: BigInt(b.validBefore as string),
    v,
    r: b.r,
    s: b.s,
  });
  const relayer = addressOf(key);
  const call = { from: relayer, to: CREDIT_DESK.address, data };

  // One relayer transaction at a time, so nonces never collide across requests.
  const lock = `relay-lock:${Date.now()}:${Math.random()}`;
  if (!(await store.setNx("relay-lock", lock, 30))) return NextResponse.json({ error: "The relayer is busy. Try again in a few seconds." }, { status: 503 });
  try {
    const gas = BigInt(await rpc<string>("eth_estimateGas", [call]));
    if (gas > GAS_CAP) return NextResponse.json({ error: "This purchase would cost more gas than the relayer pays." }, { status: 400 });
    const [nonce, base, tip] = await Promise.all([
      rpc<string>("eth_getTransactionCount", [relayer, "pending"]),
      rpc<string>("eth_gasPrice", []),
      rpc<string>("eth_maxPriorityFeePerGas", []).catch(() => "0x0"),
    ]);
    const raw = signTx(key, {
      nonce: BigInt(nonce),
      maxPriorityFeePerGas: BigInt(tip),
      maxFeePerGas: BigInt(base) * 2n + BigInt(tip),
      gas: (gas * 12n) / 10n,
      to: CREDIT_DESK.address,
      value: 0n,
      data,
    });
    const hash = await rpc<string>("eth_sendRawTransaction", [raw]);
    return NextResponse.json({ hash }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof RpcError && error.data) {
      const known = REVERTS[error.data.slice(0, 10).toLowerCase()];
      if (known) return NextResponse.json({ error: known }, { status: 400 });
    }
    const msg = error instanceof Error ? error.message : "";
    if (/insufficient funds/i.test(msg)) return NextResponse.json({ error: "The gasless relayer is unavailable right now." }, { status: 503 });
    return NextResponse.json({ error: "The purchase would fail on chain, so it was not sent." }, { status: 400 });
  } finally {
    await store.delIf("relay-lock", lock).catch(() => undefined);
  }
}
