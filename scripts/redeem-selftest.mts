// Self-test of the redeem prover: builds a credit and a tree with random leaves, proves and verifies twice:
//   1. prover-node (the SDK path, multi-threaded),
//   2. the browser setup: WASM backend, one thread, only the 2^17 SRS points this site serves.
// Run: npx tsx scripts/redeem-selftest.mts [leafCount]
import { readFileSync } from "node:fs";
import { Noir } from "@noir-lang/noir_js";
import { Barretenberg, BackendType, UltraHonkBackend } from "@aztec/bb.js";
import { IncrementalTree, creditLeaf, keyBindingOf, makeCredit, newApiKey, publicInputsOf, randomField, redeemWitness } from "../src/lib/credit/core.ts";
import { closeProver, proveRedeem, verifyRedeem } from "../src/lib/credit/prover-node.ts";

// bb.js logs progress on stdout.
const log = console.log;
console.log = () => {};

const count = Number(process.argv[2] ?? 300);
const credit = makeCredit(25);
const leaves = Array.from({ length: count }, () => randomField());
leaves.splice(Math.floor(count / 2), 0, creditLeaf(credit));
let t = Date.now();
const tree = new IncrementalTree(leaves);
log(`tree of ${tree.size} leaves built in ${Date.now() - t} ms`);
const keyBinding = keyBindingOf(newApiKey());

const node = await proveRedeem(credit, tree, keyBinding);
log(`prover-node: proof ${(node.proof.length - 2) / 2} bytes in ${node.ms} ms (index ${node.index})`);
log(`prover-node: verify ${await verifyRedeem(node.proof, node.inputs)}`);
const wrong = await verifyRedeem(node.proof, { ...node.inputs, keyBinding: keyBinding ^ 1n }).catch(() => false);
log(`prover-node: verify with another key binding ${wrong}`);
await closeProver();
if (wrong) process.exit(1);

const base = new URL("../public/zk/", import.meta.url);
const circuit = JSON.parse(readFileSync(new URL("redeem.json", base), "utf8"));
t = Date.now();
const api = await Barretenberg.new({ backend: BackendType.Wasm, threads: 1, skipSrsInit: true });
await api.srsInitSrs({ pointsBuf: readFileSync(new URL("crs/bn254_g1_compressed.dat", base)), numPoints: 131072, g2Point: readFileSync(new URL("crs/bn254_g2.dat", base)) });
const backend = new UltraHonkBackend(circuit.bytecode, api);
log(`wasm single thread: init ${Date.now() - t} ms`);
t = Date.now();
const { witness } = redeemWitness(credit, tree, keyBinding);
const { witness: solved } = await new Noir(circuit).execute(witness);
const p = await backend.generateProof(solved, { verifierTarget: "evm" });
const ms = Date.now() - t;
const ok = await backend.verifyProof(p, { verifierTarget: "evm" });
const same = JSON.stringify(p.publicInputs) === JSON.stringify(publicInputsOf(node.inputs));
log(`wasm single thread (browser-equivalent): proof in ${ms} ms, verify ${ok}, public inputs match ${same}`);
await api.destroy();
process.exit(ok && same ? 0 : 1);
