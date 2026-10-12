// Collects the compiled QOURA contracts into one generated file used by the /deploy page and by
// scripts/verify-deployment.mjs:
//   src/lib/credit/artifacts.json  (abi, creation + runtime bytecode, link and immutable references)
// Run after an unlinked forge build (no --libraries):
//   (cd contracts && ./setup.sh && forge build --force) && node scripts/contracts-artifacts.mjs
// With --check it only compares the committed file against a fresh forge build.
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const OUT = new URL("../contracts/out/", import.meta.url);
const TARGET = new URL("../src/lib/credit/artifacts.json", import.meta.url);
// Deployment order: libraries first, then the verifier (links two libraries), then the desk (links one).
const NAMES = [
  ["QouraTwinHash", "QouraTwinHash.sol"],
  ["QouraChallengeTape", "QouraRedeemCheck.sol"],
  ["QouraConstraintSet", "QouraRedeemCheck.sol"],
  ["QouraRedeemCheck", "QouraRedeemCheck.sol"],
  ["QouraCreditDesk", "QouraCreditDesk.sol"],
];

const flatLinks = (refs) =>
  Object.values(refs ?? {}).flatMap((byLib) => Object.entries(byLib).flatMap(([lib, list]) => list.map((r) => ({ lib, start: r.start, length: r.length }))));

/** Immutable byte ranges with the name of the variable they hold (from the AST). */
function namedImmutables(a) {
  const refs = a.deployedBytecode.immutableReferences ?? {};
  const names = {};
  const walk = (n) => {
    if (!n || typeof n !== "object") return;
    if (n.nodeType === "VariableDeclaration" && refs[String(n.id)]) names[n.id] = n.name;
    for (const v of Object.values(n)) walk(v);
  };
  walk(a.ast);
  return Object.entries(refs).flatMap(([id, list]) => {
    if (!names[id]) throw new Error(`no name for immutable ${id} (build with ast = true)`);
    return list.map((r) => ({ name: names[id], start: r.start, length: r.length }));
  });
}

/** The verifier's immutables are fixed by constants in its generated source. */
function verifierConstants(present) {
  const src = readFileSync(new URL("../contracts/src/QouraRedeemCheck.sol", import.meta.url), "utf8");
  const c = (name) => {
    const m = new RegExp(`uint256 constant ${name} = (0x[0-9a-fA-F]+|\\d+);`).exec(src);
    if (!m) throw new Error(`constant ${name} not found in QouraRedeemCheck.sol`);
    return BigInt(m[1]);
  };
  const logN = c("LOG_N");
  const libra = BigInt(/LIBRA_COMMITMENTS = (\d+);/.exec(src)[1]);
  const all = {
    $N: c("N"),
    $LOG_N: logN,
    $VK_HASH: c("VK_HASH"),
    $NUM_PUBLIC_INPUTS: c("NUMBER_OF_PUBLIC_INPUTS"),
    // $MSMSize = NUMBER_UNSHIFTED_ZK + LOG_N + LIBRA_COMMITMENTS + 2 (constructor of QouraCheckBase)
    $MSMSize: c("NUMBER_UNSHIFTED") + c("NUM_MASKING_POLYNOMIALS") + logN + libra + 2n,
  };
  const out = {};
  for (const name of present) {
    if (all[name] === undefined) throw new Error(`unexpected verifier immutable ${name}`);
    out[name] = all[name].toString();
  }
  return out;
}

const contracts = {};
for (const [name, file] of NAMES) {
  const a = JSON.parse(readFileSync(new URL(`${file}/${name}.json`, OUT), "utf8"));
  const creation = a.bytecode.object.toLowerCase();
  const runtime = a.deployedBytecode.object.toLowerCase();
  if (!creation.startsWith("0x") || creation.length < 10) throw new Error(`${name}: no bytecode (build first)`);
  contracts[name] = {
    abi: a.abi,
    creation,
    runtime,
    creationLinks: flatLinks(a.bytecode.linkReferences),
    runtimeLinks: flatLinks(a.deployedBytecode.linkReferences),
    immutables: namedImmutables(a),
    sha256: createHash("sha256").update(creation).digest("hex"),
  };
}
contracts.QouraRedeemCheck.expectedImmutables = verifierConstants([...new Set(contracts.QouraRedeemCheck.immutables.map((i) => i.name))]);
const out = {
  generatedBy: "scripts/contracts-artifacts.mjs",
  compiler: "solc 0.8.28, optimizer 200 runs, evm paris, no via-ir, no metadata hash",
  deployOrder: NAMES.map(([n]) => n),
  constructorArgs: { QouraCreditDesk: ["address usdg", "address treasury", "address verifier", "address initialOwner"] },
  contracts,
};
const text = JSON.stringify(out) + "\n";
if (process.argv.includes("--check")) {
  let same = false;
  try {
    same = readFileSync(TARGET, "utf8") === text;
  } catch {
    // missing file: not the same
  }
  console.log(same ? "artifacts.json matches this forge build" : "artifacts.json DIFFERS from this forge build");
  process.exit(same ? 0 : 1);
}
writeFileSync(TARGET, text);
for (const [n, c] of Object.entries(contracts)) {
  const links = [...new Set(c.creationLinks.map((l) => l.lib))];
  console.log(`${n}: ${(c.creation.length - 2) / 2} bytes, sha256 ${c.sha256.slice(0, 16)}…${links.length ? `, links ${links.join(", ")}` : ""}`);
}
