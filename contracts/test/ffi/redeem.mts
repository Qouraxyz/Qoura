// Test helper called by forge (vm.ffi): proves a redeem with the same TypeScript code the site uses
// and prints the ABI-encoded result.
//   node redeem.mts prove '{"face":25,"nullifier":"0x..","secret":"0x..","keyBinding":"0x..","leaves":["0x..",..]}'
//     -> abi.encode(bytes proof, uint256 root, uint256 spendTag, uint256 index)
import { closeProver, proveRedeem } from "../../../src/lib/credit/prover-node.ts";

// bb.js reports progress on stdout; keep stdout for the ABI result only.
console.log = (...a: unknown[]) => console.error(...a);

const w = (n: bigint | number) => BigInt(n).toString(16).padStart(64, "0");
const [cmd, arg] = process.argv.slice(2);
if (cmd === "prove") {
  const j = JSON.parse(arg);
  const credit = { face: Number(j.face), nullifier: BigInt(j.nullifier), secret: BigInt(j.secret) };
  const r = await proveRedeem(credit, (j.leaves as string[]).map(BigInt), BigInt(j.keyBinding));
  const proof = r.proof.slice(2);
  const tail = w(proof.length / 2) + proof.padEnd(Math.ceil(proof.length / 64) * 64, "0");
  process.stdout.write("0x" + w(4 * 32) + w(r.inputs.root) + w(r.inputs.spendTag) + w(r.index) + tail);
  await closeProver();
} else {
  console.error("unknown command");
  process.exit(1);
}
