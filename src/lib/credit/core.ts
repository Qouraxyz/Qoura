/*
 * QOURA credit cryptography, shared by the browser, the prover worker, the SDK, the gateway and the
 * contract tests. No framework imports: this file runs as-is in Node (type stripping) and in a
 * bundled worker.
 *
 * Hashes are circomlib-compatible Poseidon over BN254 (poseidon-lite), the same instance as the
 * circuit (circuits/redeem) and the contract library QouraTwinHash; the tests pin shared vectors.
 *
 *   commitment  = Poseidon2(nullifier, secret)
 *   leaf        = Poseidon2(commitment, face)          face in whole US dollars, 1..1000
 *   spendTag    = Poseidon1(nullifier)
 *   keyBinding  = uint(sha256(utf8(apiKey))) >> 8
 */
import { poseidon1 } from "poseidon-lite/poseidon1";
import { poseidon2 } from "poseidon-lite/poseidon2";
import { sha256 } from "@noble/hashes/sha2.js";
import { keccak_256 } from "@noble/hashes/sha3.js";

export const FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
export const TREE_DEPTH = 20;
export const ROOT_HISTORY = 100;
export const FACE_MIN = 1;
export const FACE_MAX = 1000;
export const MAX_DISCOUNT_BPS = 3000;
/** USDG base units per dollar (6 decimals). */
export const USDG_UNIT = 1_000_000n;
export const CHAIN_ID = 4663;
export const USDG_ADDRESS = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";

/* ------------------------------------------------------------------ bytes and fields */

export const hexToBytes = (hex: string) => {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (h.length % 2 || /[^0-9a-f]/i.test(h)) throw new Error("Not hex");
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(2 * i, 2 * i + 2), 16);
  return out;
};
export const bytesToHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
export const bytesToBig = (b: Uint8Array) => (b.length ? BigInt(`0x${bytesToHex(b)}`) : 0n);
/** 0x-prefixed 32-byte hex word. */
export const toHex32 = (n: bigint) => `0x${n.toString(16).padStart(64, "0")}`;
const utf8 = (s: string) => new TextEncoder().encode(s);

export const isField = (n: bigint) => n >= 0n && n < FIELD;

/** Parses a decimal or 0x-hex string (or bigint/number) into a field element; throws when out of range. */
export function toField(v: bigint | number | string): bigint {
  let n: bigint;
  try {
    n = typeof v === "bigint" ? v : BigInt(v);
  } catch {
    throw new Error("Not a number");
  }
  if (!isField(n)) throw new Error("Not a field element");
  return n;
}

export function randomBytes(n: number) {
  const out = new Uint8Array(n);
  globalThis.crypto.getRandomValues(out);
  return out;
}

/** A uniformly random nonzero field element (31 random bytes are always below the field order). */
export function randomField() {
  for (;;) {
    const n = bytesToBig(randomBytes(31));
    if (n !== 0n) return n;
  }
}

/* ------------------------------------------------------------------ credit */

export type Credit = { face: number; nullifier: bigint; secret: bigint };

export const isFace = (face: number) => Number.isInteger(face) && face >= FACE_MIN && face <= FACE_MAX;
function assertFace(face: number) {
  if (!isFace(face)) throw new Error(`Face value must be a whole number of dollars from ${FACE_MIN} to ${FACE_MAX}`);
}

export const h1 = (a: bigint) => poseidon1([a]);
export const h2 = (a: bigint, b: bigint) => poseidon2([a, b]);

export const commitmentOf = (nullifier: bigint, secret: bigint) => h2(nullifier, secret);
export const leafOf = (commitment: bigint, face: number | bigint) => h2(commitment, BigInt(face));
export const spendTagOf = (nullifier: bigint) => h1(nullifier);

/** A fresh credit of `face` dollars. The nullifier and secret never leave the buyer's device. */
export function makeCredit(face: number): Credit {
  assertFace(face);
  return { face, nullifier: randomField(), secret: randomField() };
}

export const creditCommitment = (c: Credit) => commitmentOf(c.nullifier, c.secret);
export const creditLeaf = (c: Credit) => leafOf(creditCommitment(c), c.face);
export const creditSpendTag = (c: Credit) => spendTagOf(c.nullifier);

const BACKUP_PREFIX = "qoura-credit:1:";

/** "qoura-credit:1:<face>:<nullifier 0x..>:<secret 0x..>" */
export function encodeCredit(c: Credit) {
  assertFace(c.face);
  return `${BACKUP_PREFIX}${c.face}:${toHex32(c.nullifier)}:${toHex32(c.secret)}`;
}

/** Parses a backup string; throws a readable error when it is not one. */
export function decodeCredit(text: string): Credit {
  const s = text.trim();
  const m = /^qoura-credit:1:(\d{1,4}):(0x[0-9a-fA-F]{1,64}):(0x[0-9a-fA-F]{1,64})$/.exec(s);
  if (!m) throw new Error("This is not a QOURA credit backup");
  const face = Number(m[1]);
  assertFace(face);
  const nullifier = BigInt(m[2]);
  const secret = BigInt(m[3]);
  if (!isField(nullifier) || !isField(secret) || nullifier === 0n || secret === 0n) throw new Error("The credit backup is damaged");
  return { face, nullifier, secret };
}

/* ------------------------------------------------------------------ API keys */

const API_KEY_RE = /^qk-[0-9a-f]{48}$/;
export const isApiKey = (key: string) => API_KEY_RE.test(key);

/** A new API key: "qk-" + 48 lowercase hex characters (192 random bits). */
export const newApiKey = () => `qk-${bytesToHex(randomBytes(24))}`;

/** sha256(utf8(apiKey)) >> 8: 248 bits, always below the field order. */
export function keyBindingOf(apiKey: string) {
  return bytesToBig(sha256(utf8(apiKey))) >> 8n;
}

/* ------------------------------------------------------------------ price */

/** Price in USDG base units, exactly as QouraCreditDesk.quote (ceil of the discounted price). */
export function priceOf(face: number, holder: boolean, discountBps: number | bigint) {
  assertFace(face);
  const bps = BigInt(discountBps);
  if (bps < 0n || bps > BigInt(MAX_DISCOUNT_BPS)) throw new Error("Discount out of range");
  const full = BigInt(face) * USDG_UNIT;
  return holder ? (full * (10_000n - bps) + 9_999n) / 10_000n : full;
}

/* ------------------------------------------------------------------ EIP-3009 authorization */

const word = (n: bigint | number) => BigInt(n).toString(16).padStart(64, "0");
const addrWord = (a: string) => {
  if (!/^0x[0-9a-fA-F]{40}$/.test(a)) throw new Error("Not an address");
  return a.toLowerCase().slice(2).padStart(64, "0");
};

/** keccak256(abi.encode(desk, commitment, face)): the nonce the buyer signs for this credit. */
export function authorizationNonce(desk: string, commitment: bigint, face: number | bigint) {
  return `0x${bytesToHex(keccak_256(hexToBytes(addrWord(desk) + word(commitment) + word(face))))}`;
}

export type ReceiveAuthorization = {
  from: string;
  to: string;
  value: bigint;
  validAfter: bigint;
  validBefore: bigint;
  nonce: string;
};

/** eth_signTypedData_v4 payload for USDG ReceiveWithAuthorization (domain "Global Dollar", version "1"). */
export function receiveAuthorizationTypedData(auth: ReceiveAuthorization, usdg = USDG_ADDRESS, chainId = CHAIN_ID) {
  return {
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" },
      ],
      ReceiveWithAuthorization: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" },
      ],
    },
    primaryType: "ReceiveWithAuthorization" as const,
    domain: { name: "Global Dollar", version: "1", chainId, verifyingContract: usdg },
    message: {
      from: auth.from,
      to: auth.to,
      value: auth.value.toString(),
      validAfter: auth.validAfter.toString(),
      validBefore: auth.validBefore.toString(),
      nonce: auth.nonce,
    },
  };
}

/** Splits a 65-byte signature into v, r, s (v normalised to 27/28). */
export function splitSignature(sig: string) {
  const b = hexToBytes(sig);
  if (b.length !== 65) throw new Error("Signature must be 65 bytes");
  let v = b[64];
  if (v < 27) v += 27;
  return { v, r: `0x${bytesToHex(b.slice(0, 32))}`, s: `0x${bytesToHex(b.slice(32, 64))}` };
}

/* ------------------------------------------------------------------ tree */

const ZEROS: bigint[] = (() => {
  const z = [0n];
  for (let i = 0; i < TREE_DEPTH; i++) z.push(h2(z[i], z[i]));
  return z;
})();
/** Same values as QouraCreditDesk.zeros(i). */
export const zeroAt = (level: number) => {
  if (!Number.isInteger(level) || level < 0 || level > TREE_DEPTH) throw new Error("Level out of range");
  return ZEROS[level];
};

/**
 * The desk's append-only Poseidon Merkle tree (depth 20), rebuilt from its leaves in order.
 * Only the filled part is stored; empty subtrees use the zero hashes.
 */
export class IncrementalTree {
  private levels: bigint[][];
  constructor(leaves: bigint[] = []) {
    if (leaves.length > 2 ** TREE_DEPTH) throw new Error("Too many leaves");
    this.levels = [leaves.slice()];
    for (let l = 0; l < TREE_DEPTH; l++) this.levels.push(this.parents(l, 0));
  }
  private parents(l: number, from: number) {
    const below = this.levels[l];
    const up = (this.levels[l + 1] ?? []).slice(0, from >> 1);
    for (let i = from - (from & 1); i < below.length; i += 2) up.push(h2(below[i], i + 1 < below.length ? below[i + 1] : ZEROS[l]));
    return up;
  }
  get size() {
    return this.levels[0].length;
  }
  leaves() {
    return this.levels[0].slice();
  }
  /** Appends leaves, rehashing only the changed right edge. */
  append(leaves: bigint[]) {
    if (!leaves.length) return;
    const start = this.size;
    if (start + leaves.length > 2 ** TREE_DEPTH) throw new Error("Too many leaves");
    this.levels[0].push(...leaves);
    let from = start;
    for (let l = 0; l < TREE_DEPTH; l++) {
      this.levels[l + 1] = this.parents(l, from);
      from >>= 1;
    }
  }
  root() {
    return this.levels[TREE_DEPTH][0] ?? ZEROS[TREE_DEPTH];
  }
  indexOf(leaf: bigint) {
    return this.levels[0].indexOf(leaf);
  }
  /** Sibling hashes from the leaf up, and the left/right bits (1 = the node is a right child). */
  path(index: number) {
    if (!Number.isInteger(index) || index < 0 || index >= this.size) throw new Error("Leaf out of range");
    const elements: bigint[] = [];
    const indices: number[] = [];
    let at = index;
    for (let l = 0; l < TREE_DEPTH; l++) {
      elements.push(this.levels[l][at ^ 1] ?? ZEROS[l]);
      indices.push(at & 1);
      at >>= 1;
    }
    return { elements, indices };
  }
}

/* ------------------------------------------------------------------ redeem witness */

export type RedeemInputs = { root: bigint; face: number; spendTag: bigint; keyBinding: bigint };

/**
 * Circuit inputs for redeeming `credit` against the tree of `leaves` (all desk leaves, in order).
 * Throws when the credit is not among them.
 */
export function redeemWitness(credit: Credit, leaves: bigint[] | IncrementalTree, keyBinding: bigint) {
  assertFace(credit.face);
  if (keyBinding < 0n || keyBinding >= 1n << 248n) throw new Error("Key binding must be 248 bits");
  const tree = leaves instanceof IncrementalTree ? leaves : new IncrementalTree(leaves);
  const leaf = creditLeaf(credit);
  const index = tree.indexOf(leaf);
  if (index < 0) throw new Error("This credit is not on-chain yet");
  const { elements, indices } = tree.path(index);
  const inputs: RedeemInputs = { root: tree.root(), face: credit.face, spendTag: creditSpendTag(credit), keyBinding };
  const witness = {
    root: toHex32(inputs.root),
    face: toHex32(BigInt(inputs.face)),
    spend_tag: toHex32(inputs.spendTag),
    key_binding: toHex32(keyBinding),
    nullifier: toHex32(credit.nullifier),
    secret: toHex32(credit.secret),
    path_elements: elements.map(toHex32),
    path_indices: indices.map((b) => toHex32(BigInt(b))),
  };
  return { witness, inputs, index };
}

/** Public inputs in circuit order, as the verifier takes them. */
export const publicInputsOf = (i: RedeemInputs) => [i.root, BigInt(i.face), i.spendTag, i.keyBinding].map(toHex32);
