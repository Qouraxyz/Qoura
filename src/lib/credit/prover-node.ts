/*
 * Node prover for the SDK, tests, the contract tests (forge ffi) and tools.
 * Uses the same circuit artifact as the browser (public/zk/redeem.json).
 */
import { readFileSync } from "node:fs";
import { Noir } from "@noir-lang/noir_js";
import { Barretenberg, UltraHonkBackend } from "@aztec/bb.js";
import { bytesToHex, publicInputsOf, redeemWitness, type Credit, type IncrementalTree, type RedeemInputs } from "./core.ts";

const CIRCUIT = JSON.parse(readFileSync(new URL("../../../public/zk/redeem.json", import.meta.url), "utf8"));

let ready: Promise<{ noir: Noir; backend: UltraHonkBackend; api: Barretenberg }> | null = null;

function init(threads = 4) {
  ready ??= (async () => {
    const api = await Barretenberg.new({ threads });
    return { noir: new Noir(CIRCUIT), backend: new UltraHonkBackend(CIRCUIT.bytecode, api), api };
  })();
  return ready;
}

export type RedeemProof = { proof: string; publicInputs: string[]; inputs: RedeemInputs; index: number; ms: number };

/** Proves that `credit` is one of `leaves` (all desk leaves, in order), bound to `keyBinding`. */
export async function proveRedeem(credit: Credit, leaves: bigint[] | IncrementalTree, keyBinding: bigint): Promise<RedeemProof> {
  const { witness, inputs, index } = redeemWitness(credit, leaves, keyBinding);
  const { noir, backend } = await init();
  const started = Date.now();
  const { witness: solved } = await noir.execute(witness);
  const { proof, publicInputs } = await backend.generateProof(solved, { verifierTarget: "evm" });
  return { proof: `0x${bytesToHex(proof)}`, publicInputs, inputs, index, ms: Date.now() - started };
}

/** bb.js verification of a redeem proof (same check as the Solidity verifier, off-chain). */
export async function verifyRedeem(proof: string, inputs: RedeemInputs | string[]) {
  const { backend } = await init();
  const publicInputs = Array.isArray(inputs) ? inputs : publicInputsOf(inputs);
  const bytes = Uint8Array.from(Buffer.from(proof.replace(/^0x/, ""), "hex"));
  return backend.verifyProof({ proof: bytes, publicInputs }, { verifierTarget: "evm" });
}

export async function closeProver() {
  if (!ready) return;
  const { api } = await ready;
  await api.destroy();
  ready = null;
}
