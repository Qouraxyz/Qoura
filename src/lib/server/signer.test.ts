import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { addressOf, signTx } from "./signer";

// anvil's first development key: a public test vector, never funded on mainnet.
const KEY = Uint8Array.from(Buffer.from("ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", "hex"));
const ADDR = "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266";

test("address from key", () => {
  assert.equal(addressOf(KEY), ADDR);
});

test("signed transaction recovers to the signer", { skip: !existsSync(`${homedir()}/.foundry/bin/cast`) }, () => {
  const raw = signTx(KEY, { nonce: 7n, maxPriorityFeePerGas: 1_000_000n, maxFeePerGas: 50_000_000n, gas: 900_000n, to: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", value: 0n, data: "0x18160ddd" });
  const out = execFileSync(`${homedir()}/.foundry/bin/cast`, ["decode-transaction", raw], { encoding: "utf8" });
  const decoded = JSON.parse(out) as { signer?: string; from?: string; nonce?: string; chainId?: string };
  assert.equal((decoded.signer ?? decoded.from ?? "").toLowerCase(), ADDR);
});
