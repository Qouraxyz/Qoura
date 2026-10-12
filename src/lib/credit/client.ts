"use client";

import {
  DESK_SIG,
  encodeAllowance,
  encodeApprove,
  encodeDeskBuy,
  encodeDeskBuyWithAuthorization,
  encodeDeskFaceCount,
  encodeDeskIsKnownRoot,
  encodeDeskQuote,
  readAddress,
  readWord,
} from "@/lib/abi";
import {
  IncrementalTree,
  authorizationNonce,
  creditCommitment,
  creditLeaf,
  receiveAuthorizationTypedData,
  splitSignature,
  toHex32,
  type Credit,
  type RedeemInputs,
} from "@/lib/credit/core";

/*
 * Browser side of QOURA credits: desk reads (through an eth_call function the caller passes in), the
 * leaf index from /api/credit/leaves (checked against the desk's root history), purchase calldata and
 * the gasless authorization, the prover worker, and the redeem hand-off.
 *
 * Privacy rule: the browser only downloads the whole public leaf list and asks about public values
 * (roots, prices, counts). It never names its own commitment, leaf or index to the site or the RPC
 * after buying; at redeem time it sends only the proof, root, face, spend tag and key binding.
 */

/** eth_call against the latest block; returns the hex result. */
export type EthCall = (to: string, data: string) => Promise<string>;

/* ------------------------------------------------------------ reads */

export type DeskState = {
  root: bigint;
  size: number;
  paused: boolean;
  treasury: string;
  qouraToken: string | null;
  holderMinBalance: bigint;
  holderDiscountBps: number;
};

export async function readDesk(ethCall: EthCall, desk: string): Promise<DeskState> {
  const [root, size, paused, treasury, token, minBal, bps] = await Promise.all(
    [DESK_SIG.currentRoot, DESK_SIG.nextIndex, DESK_SIG.paused, DESK_SIG.treasury, DESK_SIG.qouraToken, DESK_SIG.holderMinBalance, DESK_SIG.holderDiscountBps].map(
      (s) => ethCall(desk, s),
    ),
  );
  const tokenAddr = readAddress(token, 0);
  return {
    root: readWord(root, 0),
    size: Number(readWord(size, 0)),
    paused: readWord(paused, 0) === 1n,
    treasury: readAddress(treasury, 0),
    qouraToken: /^0x0{40}$/.test(tokenAddr) ? null : tokenAddr,
    holderMinBalance: readWord(minBal, 0),
    holderDiscountBps: Number(readWord(bps, 0)),
  };
}

/** The desk's price for `buyer` (USDG base units) and whether the holder discount applies. */
export async function readQuote(ethCall: EthCall, desk: string, buyer: string, face: number) {
  const out = await ethCall(desk, encodeDeskQuote(buyer, face));
  return { price: readWord(out, 0), holder: readWord(out, 1) === 1n };
}

/** How many credits of this face exist: the crowd a redeem hides in. */
export const readFaceCount = async (ethCall: EthCall, desk: string, face: number) => Number(readWord(await ethCall(desk, encodeDeskFaceCount(face)), 0));

export const isKnownRoot = async (ethCall: EthCall, desk: string, root: bigint) => readWord(await ethCall(desk, encodeDeskIsKnownRoot(root)), 0) === 1n;

export const readAllowance = async (ethCall: EthCall, usdg: string, owner: string, desk: string) => readWord(await ethCall(usdg, encodeAllowance(owner, desk)), 0);

/* ------------------------------------------------------------ leaves */

/** One leaf from /api/credit/leaves (decimal or 0x strings for the big numbers). */
export type LeafRecord = { i: number; leaf: string; face: number; commitment?: string; block?: number; tx?: string };

/** Every desk leaf in order, from the site's index, continuing after `known`. */
export async function fetchLeaves(known: LeafRecord[] = []): Promise<LeafRecord[]> {
  const out = known.slice();
  for (let guard = 0; guard < 10_000; guard++) {
    const res = await fetch(`/api/credit/leaves?from=${out.length}`, { cache: "no-store" });
    if (!res.ok) throw new Error(res.status === 429 ? "Too many requests. Wait a moment." : "Could not load the credit list.");
    const body = (await res.json()) as { configured?: boolean; leaves?: LeafRecord[]; total?: number };
    if (!body.configured) throw new Error("The credit desk is not deployed yet.");
    const page = body.leaves ?? [];
    for (const leaf of page) {
      if (leaf.i !== out.length) throw new Error("The credit list came back out of order.");
      out.push(leaf);
    }
    if (page.length === 0 || out.length >= (body.total ?? 0)) break;
  }
  return out;
}

/**
 * The credit tree rebuilt in this browser, checked against the desk's root history (the site's list
 * is never taken on trust). Throws when the list does not match yet (index lagging a block).
 */
export async function loadTree(ethCall: EthCall, desk: string, known: LeafRecord[] = []) {
  const leaves = await fetchLeaves(known);
  const tree = new IncrementalTree(leaves.map((l) => BigInt(l.leaf)));
  if (!(await isKnownRoot(ethCall, desk, tree.root()))) throw new Error("The credit list does not match the desk yet. Try again in a few seconds.");
  return { leaves, tree };
}

/** True when this credit's leaf is in the list (it was bought and indexed). */
export const isOnChain = (credit: Credit, leaves: LeafRecord[]) => {
  const leaf = creditLeaf(credit);
  return leaves.some((l) => BigInt(l.leaf) === leaf);
};

/* ------------------------------------------------------------ buying */

export type TxRequest = { to: string; data: string; value?: bigint };

export const approveCall = (usdg: string, desk: string, amount: bigint): TxRequest => ({ to: usdg, data: encodeApprove(desk, amount) });

/** buy(commitment, face) from the connected wallet (needs a USDG allowance for the quoted price). */
export const buyCall = (desk: string, credit: Credit): TxRequest => ({ to: desk, data: encodeDeskBuy(creditCommitment(credit), credit.face) });

/**
 * The EIP-712 request a buyer signs for the gasless path (USDG ReceiveWithAuthorization to the desk),
 * bound to this credit by its nonce. `value` must equal the desk's quote for `from`.
 */
export function authorizationRequest(o: { desk: string; from: string; credit: Credit; value: bigint; validForSeconds?: number; now?: number }) {
  const now = BigInt(Math.floor((o.now ?? Date.now()) / 1000));
  const auth = {
    from: o.from,
    to: o.desk,
    value: o.value,
    validAfter: 0n,
    validBefore: now + BigInt(o.validForSeconds ?? 3600),
    nonce: authorizationNonce(o.desk, creditCommitment(o.credit), o.credit.face),
  };
  return { auth, typedData: receiveAuthorizationTypedData(auth) };
}

export type RelayBody = {
  commitment: string;
  face: number;
  from: string;
  value: string;
  validAfter: string;
  validBefore: string;
  v: number;
  r: string;
  s: string;
  data: string;
};

/** Body for POST /api/credit/relay: the fields plus the exact calldata the relayer submits. */
export function relayBody(credit: Credit, auth: ReturnType<typeof authorizationRequest>["auth"], signature: string): RelayBody {
  const { v, r, s } = splitSignature(signature);
  const commitment = creditCommitment(credit);
  const data = encodeDeskBuyWithAuthorization({ commitment, face: credit.face, from: auth.from, value: auth.value, validAfter: auth.validAfter, validBefore: auth.validBefore, v, r, s });
  return {
    commitment: toHex32(commitment),
    face: credit.face,
    from: auth.from,
    value: auth.value.toString(),
    validAfter: auth.validAfter.toString(),
    validBefore: auth.validBefore.toString(),
    v,
    r,
    s,
    data,
  };
}

/** Hands a signed authorization to the site's relayer; returns the transaction hash. */
export async function submitRelay(body: RelayBody): Promise<string> {
  const res = await fetch("/api/credit/relay", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
  const out = (await res.json().catch(() => ({}))) as { hash?: string; error?: string };
  if (!res.ok || !out.hash || !/^0x[0-9a-fA-F]{64}$/.test(out.hash)) throw new Error(out.error || "The relayer refused the purchase.");
  return out.hash;
}

/* ------------------------------------------------------------ prover */

export type ProofResult = { proof: string; publicInputs: string[]; inputs: RedeemInputs; index: number; ms: number };

let worker: Worker | null = null;
let seq = 0;
const waiting = new Map<number, { ok: (v: ProofResult) => void; fail: (e: Error) => void }>();

function prover() {
  if (worker) return worker;
  worker = new Worker("/zk/prover.js", { type: "module" });
  worker.onmessage = (event: MessageEvent<{ id: number; ok: boolean; error?: string } & Partial<ProofResult>>) => {
    const w = waiting.get(event.data.id);
    if (!w) return;
    waiting.delete(event.data.id);
    if (event.data.ok) w.ok(event.data as ProofResult);
    else w.fail(new Error(event.data.error || "Proving failed."));
  };
  worker.onerror = () => {
    for (const w of waiting.values()) w.fail(new Error("The prover stopped. Reload the page and try again."));
    waiting.clear();
    worker = null;
  };
  return worker;
}

function ask(msg: Record<string, unknown>) {
  const id = ++seq;
  return new Promise<ProofResult>((ok, fail) => {
    waiting.set(id, { ok, fail });
    prover().postMessage({ id, ...msg });
  });
}

/** Loads the prover in the background (circuit, WASM, SRS points). */
export const warmProver = () => ask({ kind: "warm" }).then(() => undefined, () => undefined);

/** Proves in a worker that `credit` is one of `leaves` (all desk leaves, in order), bound to `keyBinding`. */
export const prove = (credit: Credit, leaves: bigint[], keyBinding: bigint) => ask({ kind: "prove", credit, leaves, keyBinding });

/* ------------------------------------------------------------ redeem */

export type RedeemBody = { proof: string; root: string; face: number; spendTag: string; keyBinding: string };

export const redeemBody = (p: Pick<ProofResult, "proof" | "inputs">): RedeemBody => ({
  proof: p.proof,
  root: toHex32(p.inputs.root),
  face: p.inputs.face,
  spendTag: toHex32(p.inputs.spendTag),
  keyBinding: toHex32(p.inputs.keyBinding),
});

/** Sends the proof to the gateway; the API key itself is never sent. */
export async function submitRedeem(body: RedeemBody) {
  const res = await fetch("/api/credit/redeem", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
  const out = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; balance?: string };
  if (!res.ok || !out.ok) throw new Error(out.error || "The redeem was refused.");
  return out;
}
