import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { USDG, match, put, sel, verifyDeployment } from "./verify-lib.mjs";

// A fake chain assembled from the real build: libraries at their own addresses, the verifier and the
// desk with links and immutables written in. Every tampered or broken answer must FAIL.
const ART = JSON.parse(readFileSync(new URL("../src/lib/credit/artifacts.json", import.meta.url), "utf8")).contracts;
const A = (n) => `0x${n.toString(16).padStart(40, "0")}`;
const word = (v) => BigInt(v).toString(16).padStart(64, "0");
const ADDR = { TWIN: A(0x31), TAPE: A(0x41), CSET: A(0x51), VER: A(0x61), DESK: A(0x71), TREAS: A(0x81), OWNER: A(0x91) };
const TX = "0x" + "a".repeat(64);

const libCode = (name, at) => "0x73" + at.slice(2) + ART[name].runtime.slice(44);
const linked = (a, field, links) => put(a[field], a[field === "runtime" ? "runtimeLinks" : "creationLinks"], (r) => links[r.lib].slice(2));
const verifierCode = (over = {}) => {
  const a = ART.QouraRedeemCheck;
  const im = Object.fromEntries(Object.entries({ ...a.expectedImmutables, ...over }).map(([k, v]) => [k, word(v)]));
  return put(linked(a, "runtime", { QouraChallengeTape: ADDR.TAPE, QouraConstraintSet: ADDR.CSET }), a.immutables, (r) => im[r.name]);
};
const deskCode = ({ usdg = USDG, verifier = ADDR.VER, twin = ADDR.TWIN } = {}) => {
  const a = ART.QouraCreditDesk;
  const im = { usdg: word(usdg), verifier: word(verifier) };
  return put(linked(a, "runtime", { QouraTwinHash: twin }), a.immutables, (r) => im[r.name]);
};
const deskCreation = (args = [USDG, ADDR.TREAS, ADDR.VER, ADDR.OWNER]) => linked(ART.QouraCreditDesk, "creation", { QouraTwinHash: ADDR.TWIN }) + args.map(word).join("");

const READS = {
  [sel("TREE_DEPTH()")]: 20n,
  [sel("ROOT_HISTORY()")]: 100n,
  [sel("FACE_MIN()")]: 1n,
  [sel("FACE_MAX()")]: 1000n,
  [sel("MAX_DISCOUNT_BPS()")]: 3000n,
  [sel("zeros(uint256)") + word(20)]: 0x2134e76ac5d21aab186c2be1dd8f84ee880a1e46eaf712f9d371b6df22191f3en,
  [sel("treasury()")]: BigInt(ADDR.TREAS),
  [sel("owner()")]: BigInt(ADDR.OWNER),
  [sel("qouraToken()")]: 0n,
  [sel("holderMinBalance()")]: 0n,
  [sel("holderDiscountBps()")]: 0n,
  [sel("paused()")]: 0n,
  [sel("nextIndex()")]: 3n,
};
const PAIR = 0x115cc0f5e7d690413df64c6b9662e9cf2a3617f2743245519e19607a4417189an;

function chain({ codes = {}, chainId = "0x1237", tx = { hash: TX, to: null, input: deskCreation() }, receipt = { status: "0x1", contractAddress: ADDR.DESK }, twinOut = PAIR, fail = {} } = {}) {
  const all = {
    [ADDR.TWIN]: libCode("QouraTwinHash", ADDR.TWIN),
    [ADDR.TAPE]: libCode("QouraChallengeTape", ADDR.TAPE),
    [ADDR.CSET]: libCode("QouraConstraintSet", ADDR.CSET),
    [ADDR.VER]: verifierCode(),
    [ADDR.DESK]: deskCode(),
    ...codes,
  };
  return async (method, params) => {
    if (fail[method]) throw new Error("boom");
    if (method === "eth_chainId") return chainId;
    if (method === "eth_getCode") return all[params[0].toLowerCase()] ?? "0x";
    if (method === "eth_call") {
      const { to, data } = params[0];
      if (to === ADDR.TWIN) return "0x" + word(twinOut);
      if (to === ADDR.DESK && READS[data] !== undefined) return "0x" + word(READS[data]);
      return "0x";
    }
    if (method === "eth_getTransactionByHash") return params[0] === TX ? tx : null;
    if (method === "eth_getTransactionReceipt") return params[0] === TX ? receipt : null;
    throw new Error(`unexpected ${method}`);
  };
}
const run = (rpc, over = {}) => verifyDeployment({ target: ADDR.DESK, rpc, ART, ...over });
const failsWith = async (p, text) => {
  const r = await p;
  assert.equal(r.ok, false, `expected FAIL containing "${text}"`);
  assert.ok(r.lines.some((l) => l.startsWith("FAIL") && l.includes(text)), `no FAIL with "${text}":\n${r.lines.join("\n")}`);
};

test("libraries match only at their own address", () => {
  assert.ok(match(ART, "QouraTwinHash", libCode("QouraTwinHash", ADDR.TWIN), ADDR.TWIN));
  assert.equal(match(ART, "QouraTwinHash", libCode("QouraTwinHash", ADDR.TWIN), ADDR.TAPE), null);
  assert.equal(match(ART, "QouraChallengeTape", libCode("QouraTwinHash", ADDR.TWIN), ADDR.TWIN), null);
});

test("desk: links and immutables are read back; any other byte is a mismatch", () => {
  const m = match(ART, "QouraCreditDesk", deskCode(), ADDR.DESK);
  assert.ok(m);
  assert.equal(m.links.QouraTwinHash, ADDR.TWIN);
  assert.equal("0x" + m.immutables.verifier.slice(24), ADDR.VER);
  const code = deskCode();
  const i = 300;
  const flipped = code.slice(0, i) + (code[i] === "0" ? "1" : "0") + code.slice(i + 1);
  assert.equal(match(ART, "QouraCreditDesk", flipped, ADDR.DESK), null);
});

test("an honest stack verifies, with and without the creation transaction", async () => {
  const r = await run(chain(), { tx: TX, expect: { treasury: ADDR.TREAS, owner: ADDR.OWNER } });
  assert.ok(r.ok, r.lines.join("\n"));
  assert.equal(r.kind, "QouraCreditDesk");
  assert.ok(r.lines.some((l) => l.includes("QouraConstraintSet") && l.startsWith("OK")));
  assert.equal((await run(chain())).ok, true);
  assert.equal((await verifyDeployment({ target: ADDR.VER, rpc: chain(), ART })).kind, "QouraRedeemCheck");
  assert.equal((await verifyDeployment({ target: ADDR.TWIN, rpc: chain(), ART })).kind, "QouraTwinHash");
});

test("a desk pointing at another verifier, token or hash library fails", async () => {
  const evil = A(0xee);
  // A verifier that is not this build (here: a copy with another verification key hash).
  await failsWith(run(chain({ codes: { [ADDR.DESK]: deskCode({ verifier: evil }), [evil]: verifierCode({ $VK_HASH: 5n }) } })), "QouraRedeemCheck.$VK_HASH");
  await failsWith(run(chain({ codes: { [ADDR.DESK]: deskCode({ verifier: evil }) } })), "is not this build's QouraRedeemCheck");
  await failsWith(run(chain({ codes: { [ADDR.DESK]: deskCode({ usdg: evil }) } })), "expected USDG");
  await failsWith(run(chain({ codes: { [ADDR.DESK]: deskCode({ twin: evil }) } })), "links QouraTwinHash");
  await failsWith(run(chain({ twinOut: 5n })), "reference vector");
  await failsWith(run(chain({ codes: { [ADDR.CSET]: "0x" } })), "QouraConstraintSet at");
});

test("settings and creation transaction are checked", async () => {
  await failsWith(run(chain(), { expect: { treasury: A(0x99) } }), "QouraCreditDesk.treasury");
  await failsWith(run(chain(), { expect: { owner: A(0x99) } }), "QouraCreditDesk.owner");
  await failsWith(run(chain({ tx: { hash: TX, to: null, input: deskCreation() + "00" } }), { tx: TX }), "constructor arguments have");
  await failsWith(run(chain({ tx: { hash: TX, to: null, input: deskCreation([USDG, ADDR.TREAS, A(0xee), ADDR.OWNER]) } }), { tx: TX }), "constructor verifier");
  await failsWith(run(chain({ tx: { hash: TX, to: null, input: deskCreation([USDG, A(0x98), ADDR.VER, ADDR.OWNER]) } }), { tx: TX, expect: { treasury: ADDR.TREAS } }), "constructor treasury");
  await failsWith(run(chain({ receipt: { status: "0x0", contractAddress: ADDR.DESK } }), { tx: TX }), "creation transaction failed");
  await failsWith(run(chain({ receipt: { status: "0x1", contractAddress: A(0x5) } }), { tx: TX }), "the transaction created");
  await failsWith(run(chain({ tx: { hash: TX, to: ADDR.DESK, input: deskCreation() } }), { tx: TX }), "not a contract creation");
  await failsWith(run(chain(), { tx: "0x" + "b".repeat(64) }), "creation transaction not found");
});

test("broken answers fail closed", async () => {
  await failsWith(run(chain({ chainId: "0x1" })), "expected 4663");
  await failsWith(run(chain({ codes: { [ADDR.DESK]: "0x" } })), "no code");
  await failsWith(run(chain({ fail: { eth_getCode: true } })), "unexpected error");
  await failsWith(run(chain({ fail: { eth_call: true } })), "QouraTwinHash vector call failed");
  await failsWith(run(chain(), { kind: "QouraRedeemCheck" }), "runtime code differs");
  await failsWith(run(chain(), { kind: "Nope" }), "unknown kind");
  await failsWith(run(chain(), { target: "0x1234" }), "address format");
  await failsWith(run(chain(), { tx: "0x12" }), "not a transaction hash");
  await failsWith(run(chain({ codes: { [ADDR.DESK]: "0x6080" } })), "matches none");
});
