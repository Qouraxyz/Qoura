// Checks behind scripts/verify-deployment.mjs, kept free of I/O so they can be tested with a fake chain.
//
// How it decides that an address runs this repository's QOURA contracts:
//   - Runtime code is compared byte for byte with src/lib/credit/artifacts.json
//     (`npm run contracts:artifacts -- --check` proves that file is a fresh forge build).
//     Only three kinds of bytes may differ, and each is then checked on its own:
//       * a library's PUSH20 self-address (must equal the address being checked),
//       * linked library addresses (each library is verified the same way, recursively),
//       * immutables, decoded by name and compared with their expected values.
//   - The kind comes from --kind or from an exact match, never guessed from size.
//   - With a creation tx, the input must equal this build's creation code (same library links)
//     followed by exactly the constructor arguments, which must agree with the deployed immutables.
// Every check fails closed: an RPC error, an empty or malformed answer is a FAIL, never a skip.
import { keccak_256 } from "@noble/hashes/sha3.js";

export const CHAIN_ID = 4663;
export const USDG = "0x5fc5360d0400a0fd4f2af552add042d716f1d168";
export const LIBS = ["QouraTwinHash", "QouraChallengeTape", "QouraConstraintSet"];
export const KINDS = [...LIBS, "QouraRedeemCheck", "QouraCreditDesk"];
const PAIR_12 = 0x115cc0f5e7d690413df64c6b9662e9cf2a3617f2743245519e19607a4417189an;
const ZERO_20 = 0x2134e76ac5d21aab186c2be1dd8f84ee880a1e46eaf712f9d371b6df22191f3en;

const isAddr = (v) => typeof v === "string" && /^0x[0-9a-fA-F]{40}$/.test(v);
const isHash = (v) => typeof v === "string" && /^0x[0-9a-fA-F]{64}$/.test(v);
const isHex = (v) => typeof v === "string" && /^0x([0-9a-fA-F]{2})*$/.test(v);
export const sel = (sig) => "0x" + Buffer.from(keccak_256(new TextEncoder().encode(sig))).toString("hex").slice(0, 8);
const slice = (hex, start, length) => hex.slice(2 + start * 2, 2 + (start + length) * 2);
export const put = (hex, ranges, bytes) => {
  let out = hex.slice(2);
  for (const r of ranges) out = out.slice(0, r.start * 2) + bytes(r) + out.slice((r.start + r.length) * 2);
  return "0x" + out;
};
const asAddr = (word) => "0x" + word.slice(24);
const word = (n) => BigInt(n).toString(16).padStart(64, "0");

/** Exact structural match: { links, immutables } when `code` is this build's `kind` apart from links and immutables, else null. */
export function match(ART, kind, code, at) {
  const a = ART[kind];
  code = String(code).toLowerCase();
  if (!a || code.length !== a.runtime.length) return null;
  if (LIBS.includes(kind)) {
    // A deployed library begins with PUSH20 <its own address>; nothing else may differ.
    return code === "0x73" + at.toLowerCase().slice(2) + a.runtime.slice(44) ? { links: {}, immutables: {} } : null;
  }
  const links = {};
  for (const l of a.runtimeLinks) {
    const v = "0x" + slice(code, l.start, l.length);
    if (links[l.lib] && links[l.lib] !== v) return null;
    links[l.lib] = v;
  }
  const immutables = {};
  for (const r of a.immutables) {
    const v = slice(code, r.start, r.length);
    if (immutables[r.name] !== undefined && immutables[r.name] !== v) return null;
    immutables[r.name] = v;
  }
  const rebuilt = put(put(a.runtime, a.runtimeLinks, (r) => links[r.lib].slice(2)), a.immutables, (r) => immutables[r.name]);
  return rebuilt === code ? { links, immutables } : null;
}

/**
 * target: address. kind: optional. tx: optional creation tx hash. rpc(method, params) -> result (may throw).
 * expect: { treasury?, owner? } (optional; when given they must match). ART: artifacts.json `contracts`.
 * Returns { ok, lines, kind }.
 */
export async function verifyDeployment({ target, kind, tx, rpc, expect = {}, ART }) {
  const lines = [];
  let failed = false;
  const ok = (msg) => lines.push(`OK   ${msg}`);
  const info = (msg) => lines.push(`INFO ${msg}`);
  const fail = (msg) => {
    failed = true;
    lines.push(`FAIL ${msg}`);
  };
  const done = (k) => ({ ok: !failed, lines, kind: failed ? null : k });
  const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
  const call = async (to, data) => {
    const out = await rpc("eth_call", [{ to, data }, "latest"]);
    if (!isHex(out) || out.length < 66) throw new Error(`empty answer for ${data.slice(0, 10)}`);
    return out;
  };
  const verified = new Map();

  async function verify(k, at) {
    at = at.toLowerCase();
    if (verified.has(at)) return verified.get(at);
    let code;
    try {
      code = String((await rpc("eth_getCode", [at, "latest"])) || "0x").toLowerCase();
    } catch (e) {
      fail(`${k} at ${at}: eth_getCode failed (${e instanceof Error ? e.message : e})`);
      return null;
    }
    if (code === "0x") {
      fail(`${k} at ${at}: no code`);
      return null;
    }
    const m = match(ART, k, code, at);
    verified.set(at, m);
    if (!m) {
      fail(`${k} at ${at}: runtime code differs from this build`);
      return null;
    }
    ok(`${k} at ${at}: runtime code is this build${LIBS.includes(k) ? " (only the self-address differs)" : ""}`);
    for (const [lib, address] of Object.entries(m.links)) {
      if ((await verify(lib, address)) === null) fail(`${k} links ${lib} at ${address}, which is not this build`);
    }
    if (k === "QouraTwinHash") await poseidonVector(at);
    if (k === "QouraRedeemCheck") {
      for (const [name, want] of Object.entries(ART.QouraRedeemCheck.expectedImmutables)) {
        const got = BigInt("0x" + m.immutables[name]).toString();
        if (got === want) ok(`QouraRedeemCheck.${name} = ${got}`);
        else fail(`QouraRedeemCheck.${name} = ${got}, expected ${want}`);
      }
    }
    if (k === "QouraCreditDesk") await deskSettings(at, m);
    return m;
  }

  async function poseidonVector(at) {
    try {
      const out = await call(at, sel("hash(uint256[2])") + word(1) + word(2));
      if (BigInt(out) === PAIR_12) ok("QouraTwinHash hashes the circomlib reference vector");
      else fail("QouraTwinHash does not hash the reference vector");
    } catch (e) {
      fail(`QouraTwinHash vector call failed: ${e instanceof Error ? e.message : e}`);
    }
  }

  async function deskSettings(at, m) {
    const usdg = asAddr(m.immutables.usdg);
    if (same(usdg, USDG)) ok(`QouraCreditDesk.usdg = ${usdg} (USDG)`);
    else fail(`QouraCreditDesk.usdg = ${usdg}, expected USDG ${USDG}`);
    const verifier = asAddr(m.immutables.verifier);
    if ((await verify("QouraRedeemCheck", verifier)) === null) fail(`QouraCreditDesk.verifier ${verifier} is not this build's QouraRedeemCheck`);
    else ok(`QouraCreditDesk.verifier = ${verifier}`);
    try {
      const n = async (sig, ...args) => BigInt(await call(at, sel(sig) + args.map(word).join("")));
      const [depth, history, fmin, fmax, maxBps, zero20] = await Promise.all([
        n("TREE_DEPTH()"),
        n("ROOT_HISTORY()"),
        n("FACE_MIN()"),
        n("FACE_MAX()"),
        n("MAX_DISCOUNT_BPS()"),
        n("zeros(uint256)", 20),
      ]);
      if (depth === 20n && history === 100n && fmin === 1n && fmax === 1000n && maxBps === 3000n && zero20 === ZERO_20)
        ok("tree depth 20, root history 100, faces 1..1000, discount cap 3000 bps, zero hashes match");
      else fail(`constants: depth ${depth}, history ${history}, faces ${fmin}..${fmax}, cap ${maxBps}, zeros(20) ${zero20}`);
      const a = async (sig) => asAddr((await call(at, sel(sig))).slice(2));
      const treasury = await a("treasury()");
      const owner = await a("owner()");
      for (const [label, got, want] of [
        ["treasury", treasury, expect.treasury],
        ["owner", owner, expect.owner],
      ]) {
        if (!want) info(`QouraCreditDesk.${label} = ${got} (pass --${label} to require a value)`);
        else if (same(got, want)) ok(`QouraCreditDesk.${label} = ${got}`);
        else fail(`QouraCreditDesk.${label} = ${got}, expected ${want}`);
      }
      const token = await a("qouraToken()");
      info(`qouraToken ${/^0x0{40}$/.test(token) ? "not set yet" : token}, holderMinBalance ${await n("holderMinBalance()")}, holderDiscountBps ${await n("holderDiscountBps()")}, paused ${(await n("paused()")) === 1n}, credits ${await n("nextIndex()")}`);
    } catch (e) {
      fail(`could not read the desk settings: ${e instanceof Error ? e.message : e}`);
    }
  }

  async function checkCreation(k, at, txHash) {
    const t = await rpc("eth_getTransactionByHash", [txHash]);
    const receipt = await rpc("eth_getTransactionReceipt", [txHash]);
    if (!t || typeof t !== "object") return fail("creation transaction not found");
    if (!receipt || typeof receipt !== "object") return fail("creation receipt not found");
    if (!isHash(t.hash) || !same(t.hash, txHash)) fail(`transaction hash ${t.hash} differs from ${txHash}`);
    if (t.to !== null && t.to !== undefined) fail("the transaction is not a contract creation");
    if (receipt.status !== "0x1") fail("the creation transaction failed");
    if (!isAddr(receipt.contractAddress) || !same(receipt.contractAddress, at)) return fail(`the transaction created ${receipt.contractAddress}, not ${at}`);
    ok(`transaction ${txHash} created ${at}`);
    const a = ART[k];
    const links = verified.get(at)?.links ?? {};
    const creation = put(a.creation, a.creationLinks, (r) => (links[r.lib] ?? "0x" + "00".repeat(20)).slice(2));
    const input = String(t.input || "").toLowerCase();
    if (!isHex(input) || !input.startsWith(creation)) return fail("creation input differs from this build's creation code");
    ok("creation input starts with this build's creation code (same library links)");
    const args = input.slice(creation.length);
    if (k !== "QouraCreditDesk") return args.length === 0 ? ok("no constructor arguments") : fail("unexpected constructor arguments");
    if (args.length !== 4 * 64) return fail(`constructor arguments have ${args.length / 2} bytes, expected 128`);
    const w = (i) => args.slice(i * 64, (i + 1) * 64);
    const im = verified.get(at)?.immutables ?? {};
    if (w(0) === im.usdg) ok("constructor usdg = deployed usdg");
    else fail("constructor usdg differs from the deployed value");
    if (w(2) === im.verifier) ok("constructor verifier = deployed verifier");
    else fail("constructor verifier differs from the deployed value");
    for (const [i, label] of [
      [1, "treasury"],
      [3, "owner"],
    ]) {
      const v = asAddr(w(i));
      if (expect[label] && !same(v, expect[label])) fail(`constructor ${label} ${v}, expected ${expect[label]}`);
      else info(`constructor ${label} = ${v}`);
    }
  }

  if (!isAddr(target)) {
    fail(`address format: ${target}`);
    return done(null);
  }
  target = target.toLowerCase();
  if (tx !== undefined && !isHash(tx)) {
    fail(`--tx is not a transaction hash: ${tx}`);
    return done(null);
  }
  if (kind !== undefined && !KINDS.includes(kind)) {
    fail(`unknown kind ${kind}; one of ${KINDS.join(", ")}`);
    return done(null);
  }
  try {
    const id = await rpc("eth_chainId", []);
    if (!/^0x[0-9a-fA-F]+$/.test(String(id))) {
      fail(`chain id unreadable: ${id}`);
      return done(null);
    }
    if (Number(BigInt(id)) === CHAIN_ID) ok(`chain id ${CHAIN_ID}`);
    else fail(`chain id is ${Number(BigInt(id))}, expected ${CHAIN_ID}`);
    const code = String((await rpc("eth_getCode", [target, "latest"])) || "0x").toLowerCase();
    if (code === "0x") {
      fail(`no code at ${target}`);
      return done(null);
    }
    if (!kind) kind = KINDS.find((k) => match(ART, k, code, target));
    if (!kind) {
      fail("the code at that address matches none of the QOURA contracts in this build");
      return done(null);
    }
    await verify(kind, target);
    if (tx) await checkCreation(kind, target, tx);
    else info("creation transaction not checked (pass --tx <hash> to compare creation code and constructor arguments)");
  } catch (e) {
    fail(`unexpected error: ${e instanceof Error ? e.message : e}`);
  }
  return done(kind ?? null);
}
