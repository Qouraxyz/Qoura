// Proves that a deployed address runs exactly this repository's QOURA contract code.
//   (cd contracts && ./setup.sh && forge build --force) && npm run contracts:artifacts -- --check
//   npm run verify-deployment -- <address> [--tx <creation tx hash>] [--kind QouraCreditDesk] [--treasury 0x..] [--owner 0x..]
// Given the desk, it also walks the verifier and every linked library. Prints OK/FAIL/INFO per check and
// exits non-zero on any FAIL. See scripts/verify-lib.mjs for what is compared.
// RPC: VERIFY_RPC_URL from your shell, else a public Robinhood Chain endpoint.
import { readFileSync } from "node:fs";
import { verifyDeployment } from "./verify-lib.mjs";

const RPC = process.env.VERIFY_RPC_URL || "https://robinhood.drpc.org";
const args = process.argv.slice(2);
const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const address = args.find((a) => /^0x[0-9a-fA-F]{40}$/.test(a) && args[args.indexOf(a) - 1]?.startsWith("--") !== true);

async function rpc(method, params) {
  const res = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  if (!body || typeof body !== "object" || !("result" in body || "error" in body)) throw new Error("malformed JSON-RPC answer");
  if (body.error) throw new Error(`${method}: ${body.error.message}`);
  return body.result;
}

if (!address) {
  console.log("usage: npm run verify-deployment -- <address> [--tx <hash>] [--kind <name>] [--treasury <address>] [--owner <address>]");
  process.exit(2);
}
let ART;
try {
  ART = JSON.parse(readFileSync(new URL("../src/lib/credit/artifacts.json", import.meta.url), "utf8")).contracts;
} catch {
  console.log("FAIL src/lib/credit/artifacts.json is missing. Run: cd contracts && ./setup.sh && forge build --force && cd .. && npm run contracts:artifacts");
  process.exit(1);
}
const result = await verifyDeployment({
  target: address,
  kind: opt("--kind"),
  tx: opt("--tx"),
  rpc,
  expect: { treasury: opt("--treasury"), owner: opt("--owner") },
  ART,
});
for (const l of result.lines) console.log(l);
console.log(result.ok ? `MATCH: ${address} runs ${result.kind} from this build.` : "MISMATCH: do not trust this deployment.");
process.exit(result.ok ? 0 : 1);
