import { test } from "node:test";
import assert from "node:assert/strict";
import { DESK_SIG } from "./abi";
import { REVERTS, decodeStringAt, encodeApprove, encodeBalanceOf, selector } from "./calls";

test("desk selectors match their signatures", () => {
  assert.equal(`0x${selector("buy(uint256,uint256)")}`, DESK_SIG.buy);
  assert.equal(`0x${selector("quote(address,uint256)")}`, DESK_SIG.quote);
  assert.equal(`0x${selector("checkRedeem(bytes,uint256,uint256,uint256,uint256)")}`, DESK_SIG.checkRedeem);
});

test("ERC-20 calldata matches cast calldata", () => {
  const owner = "0x1111111111111111111111111111111111111111";
  assert.equal(encodeBalanceOf(owner), "0x70a082310000000000000000000000001111111111111111111111111111111111111111");
  assert.equal(
    encodeApprove(owner, 5_000_000n),
    "0x095ea7b3000000000000000000000000111111111111111111111111111111111111111100000000000000000000000000000000000000000000000000000000004c4b40",
  );
});

test("string results decode", () => {
  const hex = "0x000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000045553444700000000000000000000000000000000000000000000000000000000";
  assert.equal(decodeStringAt(hex), "USDG");
});

test("pause has a sentence", () => {
  assert.ok(REVERTS[`0x${selector("EnforcedPause()")}`]);
});
