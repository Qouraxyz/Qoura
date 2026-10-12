import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { CHAIN } from "@/config/brand";

/*
 * Server only. The relayer's hot wallet: signs EIP-1559 transactions for Robinhood Chain from QOURA_RELAYER_KEY
 * (0x + 64 hex, server env only). It pays gas for gasless credit purchases and nothing else: the
 * relay route only ever asks it to call buyWithAuthorization on the credit desk.
 */

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const fromHex = (h: string) => {
  const s = h.startsWith("0x") ? h.slice(2) : h;
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(s.slice(i * 2, i * 2 + 2), 16);
  return out;
};

export function relayerKey(): Uint8Array | null {
  const raw = process.env.QOURA_RELAYER_KEY?.trim() ?? "";
  if (!/^0x[0-9a-fA-F]{64}$/.test(raw)) return null;
  return fromHex(raw);
}

export function addressOf(key: Uint8Array) {
  const pub = secp256k1.getPublicKey(key, false).slice(1);
  return `0x${hex(keccak_256(pub).slice(-20))}`;
}

type Rlp = Uint8Array | Rlp[];

function rlp(item: Rlp): Uint8Array {
  if (item instanceof Uint8Array) {
    if (item.length === 1 && item[0] < 0x80) return item;
    return concat(lengthPrefix(item.length, 0x80), item);
  }
  const body = concat(...item.map(rlp));
  return concat(lengthPrefix(body.length, 0xc0), body);
}

function lengthPrefix(len: number, offset: number) {
  if (len < 56) return Uint8Array.of(offset + len);
  const b = big(BigInt(len));
  return concat(Uint8Array.of(offset + 55 + b.length), b);
}

function concat(...parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** Minimal big-endian bytes (empty for zero), as RLP wants integers. */
function big(n: bigint) {
  if (n === 0n) return new Uint8Array();
  let s = n.toString(16);
  if (s.length % 2) s = `0${s}`;
  return fromHex(s);
}

export type Tx1559 = { nonce: bigint; maxPriorityFeePerGas: bigint; maxFeePerGas: bigint; gas: bigint; to: string; value: bigint; data: string };

/** Signed type-2 transaction, ready for eth_sendRawTransaction. */
export function signTx(key: Uint8Array, tx: Tx1559, chainId = CHAIN.id) {
  const fields: Rlp[] = [
    big(BigInt(chainId)),
    big(tx.nonce),
    big(tx.maxPriorityFeePerGas),
    big(tx.maxFeePerGas),
    big(tx.gas),
    fromHex(tx.to),
    big(tx.value),
    fromHex(tx.data),
    [],
  ];
  const payload = concat(Uint8Array.of(2), rlp(fields));
  const digest = keccak_256(payload);
  const sig = secp256k1.sign(digest, key, { prehash: false, format: "recovered" });
  // "recovered" format: recovery byte first, then r and s.
  const recovery = sig[0];
  const r = sig.slice(1, 33);
  const s = sig.slice(33, 65);
  const signed = concat(Uint8Array.of(2), rlp([...fields, big(BigInt(recovery)), big(BigInt(`0x${hex(r)}`)), big(BigInt(`0x${hex(s)}`))]));
  return `0x${hex(signed)}`;
}
