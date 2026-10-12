import { test } from "node:test";
import assert from "node:assert/strict";
import { USDG } from "@/config/brand";
import { checkBatch, runRelay } from "./relay";

const call = (to: string, data = "0x") => ({ method: "eth_call", params: [{ to, data }, "latest"] });

test("reads of known contracts are priced", () => {
  const out = checkBatch([call(USDG.address, "0x18160ddd")]);
  assert.ok("units" in out && out.units === 2);
});

test("unknown targets, signed transactions and wide log scans are refused", () => {
  assert.ok("error" in checkBatch([call("0x000000000000000000000000000000000000dead")]));
  assert.ok("error" in checkBatch([{ method: "eth_sendRawTransaction", params: ["0x02"] }]));
  assert.ok("error" in checkBatch([{ method: "eth_getLogs", params: [{ address: USDG.address, fromBlock: "0x1", toBlock: "latest" }] }]));
  assert.ok("error" in checkBatch([{ method: "eth_getLogs", params: [{ address: USDG.address, fromBlock: "0x1", toBlock: "0x100000" }] }]));
});

test("a refused budget never reaches the RPC", async () => {
  let reached = false;
  const out = await runRelay(call(USDG.address, "0x18160ddd"), {
    charge: async () => "slow down",
    one: async () => {
      reached = true;
      return { result: "0x" };
    },
    many: async () => [],
  });
  assert.equal(out.status, 429);
  assert.equal(reached, false);
});
