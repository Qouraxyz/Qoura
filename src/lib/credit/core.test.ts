import { test } from "node:test";
import assert from "node:assert/strict";
import { keccak_256 } from "@noble/hashes/sha3.js";
import {
  CREDIT_ADDED_TOPIC,
  DESK_ERRORS,
  DESK_SIG,
  decodeCreditAdded,
  encodeDeskBuyWithAuthorization,
  encodeDeskCheckRedeem,
} from "../abi.ts";
import {
  FIELD,
  IncrementalTree,
  authorizationNonce,
  bytesToHex,
  commitmentOf,
  creditLeaf,
  decodeCredit,
  encodeCredit,
  h1,
  h2,
  isApiKey,
  keyBindingOf,
  leafOf,
  makeCredit,
  newApiKey,
  priceOf,
  publicInputsOf,
  receiveAuthorizationTypedData,
  redeemWitness,
  spendTagOf,
  splitSignature,
  toHex32,
  zeroAt,
} from "./core.ts";

// Shared with contracts/test/QouraCreditDesk.t.sol and circuits/redeem (keep in sync).
const V = {
  pair12: 0x115cc0f5e7d690413df64c6b9662e9cf2a3617f2743245519e19607a4417189an,
  single1: 0x29176100eaa962bdc1fe6c654d6a3c130e96a4d1168b33848b897dc502820133n,
  commitment: 0x040a9753d2b6067ddc2659378c9725a3fcc92191288e9d5af2a5e69a587dadd2n, // Poseidon2(11, 22)
  leaf: 0x28df7ac67005efb84c12e56c32971d3f1e351f90bbeedf37c268a1abd7efc739n, // Poseidon2(commitment, 25)
  spendTag: 0x046057e5bf9cc266b10a3ebb901424f2acd84f77cc73e2cc1fbf0d7561c94179n, // Poseidon1(11)
  keyBinding: 0x00c7212d98058659f267c1a426161a557e022e77d24f7a65a71c539bd9309220n, // "qk-" + 48 zeros
  nonce: "0x1c2559198808dd162bf112115d34daf7439ef07b7c6870f0bd32a150c14ee909", // desk 0x…aa, commitment above, face 25
  zero20: 0x2134e76ac5d21aab186c2be1dd8f84ee880a1e46eaf712f9d371b6df22191f3en,
  // leaves Poseidon2(Poseidon2(x, x + 100), 10) for x = 1..5; roots after each insert
  roots: [
    0x1b210660145e73d9adb90da99e79444c860ba552bd4b5d4d89d7d7e4fe3359bcn,
    0x0fdfd9f0fda3430a003c58c01c002867a3ae0bbe46d1edcdadf42514d9524752n,
    0x2363dff860d02f5d065a9d74d3b7e65ac122086cfa7e31e401ebe06a90e3ebb7n,
    0x1729326e8c17a08456e670350f1ebbbdc7e1d05aaa56046b22ff864ebef6fea4n,
    0x1ab749881961831d71cc8ae1b132a6eb8efd1e05453451c7e0de95e9765bc134n,
  ],
};
const sampleLeaves = (n: number) => Array.from({ length: n }, (_, i) => leafOf(commitmentOf(BigInt(i + 1), BigInt(i + 101)), 10));

test("Poseidon and credit vectors match the contract and the circuit", () => {
  assert.equal(h2(1n, 2n), V.pair12);
  assert.equal(h1(1n), V.single1);
  assert.equal(commitmentOf(11n, 22n), V.commitment);
  assert.equal(leafOf(V.commitment, 25), V.leaf);
  assert.equal(spendTagOf(11n), V.spendTag);
  assert.equal(keyBindingOf("qk-" + "0".repeat(48)), V.keyBinding);
  assert.equal(authorizationNonce("0x00000000000000000000000000000000000000aa", V.commitment, 25), V.nonce);
  assert.equal(zeroAt(20), V.zero20);
  assert.equal(zeroAt(0), 0n);
  for (let i = 1; i <= 20; i++) assert.equal(zeroAt(i), h2(zeroAt(i - 1), zeroAt(i - 1)));
});

test("tree roots match the contract after each insert; append equals rebuild", () => {
  const leaves = sampleLeaves(5);
  assert.equal(new IncrementalTree([]).root(), V.zero20);
  const grown = new IncrementalTree();
  leaves.forEach((leaf, i) => {
    assert.equal(new IncrementalTree(leaves.slice(0, i + 1)).root(), V.roots[i]);
    grown.append([leaf]);
    assert.equal(grown.root(), V.roots[i]);
  });
  const many = sampleLeaves(37);
  const a = new IncrementalTree(many.slice(0, 13));
  a.append(many.slice(13, 14));
  a.append(many.slice(14));
  assert.equal(a.root(), new IncrementalTree(many).root());
});

test("paths open to the root", () => {
  const leaves = sampleLeaves(11);
  const tree = new IncrementalTree(leaves);
  for (let i = 0; i < leaves.length; i++) {
    const { elements, indices } = tree.path(i);
    let node = leaves[i];
    elements.forEach((sib, l) => (node = indices[l] ? h2(sib, node) : h2(node, sib)));
    assert.equal(node, tree.root());
    assert.equal(indices.reduce((acc, b, l) => acc + (b << l), 0), i);
  }
  assert.throws(() => tree.path(11));
});

test("credits: fresh values in the field, backup round trip, damaged backups refused", () => {
  const c = makeCredit(25);
  assert.ok(c.nullifier > 0n && c.nullifier < FIELD && c.secret > 0n && c.secret < 1n << 248n);
  const text = encodeCredit(c);
  assert.match(text, /^qoura-credit:1:25:0x[0-9a-f]{64}:0x[0-9a-f]{64}$/);
  assert.deepEqual(decodeCredit(`  ${text}\n`), c);
  assert.throws(() => makeCredit(0));
  assert.throws(() => makeCredit(1001));
  assert.throws(() => makeCredit(2.5));
  assert.throws(() => decodeCredit(text.replace(":25:", ":1001:")));
  assert.throws(() => decodeCredit(text.replace("qoura-credit:1", "qoura-credit:2")));
  assert.throws(() => decodeCredit(`qoura-credit:1:5:${toHex32(FIELD)}:0x01`));
  assert.throws(() => decodeCredit("qoura-credit:1:5:0x0:0x01"));
});

test("API keys and key binding", () => {
  const k = newApiKey();
  assert.ok(isApiKey(k));
  assert.ok(!isApiKey(k.toUpperCase()));
  assert.ok(keyBindingOf(k) < 1n << 248n);
  assert.notEqual(keyBindingOf(k), keyBindingOf(newApiKey()));
});

test("price: full price, holder discount rounded up", () => {
  assert.equal(priceOf(25, false, 3000), 25_000_000n);
  assert.equal(priceOf(25, true, 0), 25_000_000n);
  assert.equal(priceOf(25, true, 1000), 22_500_000n);
  assert.equal(priceOf(1, true, 3), 999_700n);
  assert.equal(priceOf(3, true, 3000), 2_100_000n);
  assert.throws(() => priceOf(5, true, 3001));
});

test("redeem witness: public inputs in circuit order; unknown credit refused", () => {
  const credit = { face: 25, nullifier: 11n, secret: 22n };
  const leaves = [...sampleLeaves(3), creditLeaf(credit), ...sampleLeaves(2)];
  const { witness, inputs, index } = redeemWitness(credit, leaves, V.keyBinding);
  assert.equal(index, 3);
  assert.equal(inputs.root, new IncrementalTree(leaves).root());
  assert.equal(witness.path_elements.length, 20);
  assert.deepEqual(witness.path_indices.slice(0, 3).map((h) => Number(BigInt(h))), [1, 1, 0]);
  assert.deepEqual(publicInputsOf(inputs), [toHex32(inputs.root), toHex32(25n), toHex32(V.spendTag), toHex32(V.keyBinding)]);
  assert.throws(() => redeemWitness({ ...credit, secret: 23n }, leaves, 1n), /not on-chain/);
  assert.throws(() => redeemWitness(credit, leaves, 1n << 248n));
});

test("desk selectors and event topic are keccak of their signatures", () => {
  const sigs: Record<string, string> = {
    buy: "buy(uint256,uint256)",
    buyWithAuthorization: "buyWithAuthorization(uint256,uint256,address,uint256,uint256,uint256,uint8,bytes32,bytes32)",
    quote: "quote(address,uint256)",
    checkRedeem: "checkRedeem(bytes,uint256,uint256,uint256,uint256)",
    currentRoot: "currentRoot()",
    isKnownRoot: "isKnownRoot(uint256)",
    nextIndex: "nextIndex()",
    faceCount: "faceCount(uint256)",
    commitmentUsed: "commitmentUsed(uint256)",
    authorizationNonce: "authorizationNonce(uint256,uint256)",
    paused: "paused()",
    treasury: "treasury()",
    qouraToken: "qouraToken()",
    holderMinBalance: "holderMinBalance()",
    holderDiscountBps: "holderDiscountBps()",
    owner: "owner()",
    usdg: "usdg()",
    verifier: "verifier()",
    approve: "approve(address,uint256)",
    allowance: "allowance(address,address)",
    balanceOf: "balanceOf(address)",
  };
  const k = (s: string) => `0x${bytesToHex(keccak_256(new TextEncoder().encode(s)))}`;
  for (const [name, sig] of Object.entries(sigs)) assert.equal(DESK_SIG[name as keyof typeof DESK_SIG], k(sig).slice(0, 10), name);
  assert.equal(Object.keys(sigs).length, Object.keys(DESK_SIG).length);
  assert.equal(CREDIT_ADDED_TOPIC, k("CreditAdded(uint256,uint256,uint256,uint256,uint256,uint256,bool)"));
  for (const [s, name] of [
    ["0xc38b437f", "BadCommitment()"],
    ["0xaa63b930", "CommitmentTaken(uint256)"],
    ["0x195a3ca1", "WrongValue(uint256,uint256)"],
    ["0xd93c0665", "EnforcedPause()"],
    ["0x43023786", "FaceOutOfRange(uint256)"],
  ]) {
    assert.equal(k(name).slice(0, 10), s, name);
    assert.ok(DESK_ERRORS[s]);
  }
});

test("calldata and log encoding", () => {
  const data = encodeDeskBuyWithAuthorization({ commitment: 5n, face: 25, from: "0x" + "ab".repeat(20), value: 7n, validAfter: 0n, validBefore: 9n, v: 27, r: "0x" + "11".repeat(32), s: "0x" + "22".repeat(32) });
  assert.equal(data.length, 10 + 9 * 64);
  const cr = encodeDeskCheckRedeem("0x" + "ff".repeat(33), 1n, 25, 2n, 3n);
  // head: offset 0xa0, then four words; tail: length 33 and two padded words.
  assert.equal(cr.slice(10, 74), (0xa0).toString(16).padStart(64, "0"));
  assert.equal(cr.length, 10 + (5 + 1 + 2) * 64);
  const w = (n: bigint) => n.toString(16).padStart(64, "0");
  const log = decodeCreditAdded({ topics: [CREDIT_ADDED_TOPIC, toHex32(7n)], data: "0x" + [V.commitment, 25n, V.leaf, V.roots[0], 25_000_000n, 1n].map(w).join("") });
  assert.deepEqual(log, { index: 7, commitment: V.commitment, face: 25, leaf: V.leaf, root: V.roots[0], paid: 25_000_000n, holder: true });
  assert.equal(decodeCreditAdded({ topics: [toHex32(1n)], data: "0x" }), null);
});

test("authorization typed data and signature split", () => {
  const td = receiveAuthorizationTypedData({ from: "0x" + "01".repeat(20), to: "0x" + "02".repeat(20), value: 5n, validAfter: 0n, validBefore: 10n, nonce: V.nonce });
  assert.equal(td.domain.name, "Global Dollar");
  assert.equal(td.domain.version, "1");
  assert.equal(td.domain.chainId, 4663);
  assert.equal(td.message.value, "5");
  const sig = "0x" + "aa".repeat(32) + "bb".repeat(32) + "01";
  assert.deepEqual(splitSignature(sig), { v: 28, r: "0x" + "aa".repeat(32), s: "0x" + "bb".repeat(32) });
  assert.throws(() => splitSignature("0x1234"));
});
