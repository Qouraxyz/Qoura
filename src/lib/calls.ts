import { keccak_256 } from "@noble/hashes/sha3.js";
import { DESK_ERRORS, address as addr, encode, fixed, word } from "@/lib/abi";

/*
 * Calldata and result decoding for every contract the site touches, without an ABI library.
 * Shared by the browser, the server routes and the tests.
 */

const enc = new TextEncoder();
const hexOf = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

/** First four bytes of keccak256(signature), as 8 hex characters. */
export const selector = (signature: string) => hexOf(keccak_256(enc.encode(signature)).slice(0, 4));
export const topic = (signature: string) => `0x${hexOf(keccak_256(enc.encode(signature)))}`;

const strip = (h: string) => (h.startsWith("0x") ? h.slice(2) : h);
const call = (sig: string, parts: Parameters<typeof encode>[0] = []) => `0x${selector(sig)}${encode(parts)}`;

// ---- ERC-20 ----
export const encodeBalanceOf = (owner: string) => call("balanceOf(address)", [fixed(addr(owner))]);
export const encodeAllowance = (owner: string, spender: string) => call("allowance(address,address)", [fixed(addr(owner)), fixed(addr(spender))]);
export const encodeApprove = (spender: string, amount: bigint) => call("approve(address,uint256)", [fixed(addr(spender)), fixed(word(amount))]);
export const encodeTransfer = (to: string, amount: bigint) => call("transfer(address,uint256)", [fixed(addr(to)), fixed(word(amount))]);
export const encodeDecimals = () => call("decimals()");
export const encodeSymbol = () => call("symbol()");

// ---- decoding ----
const W = 64;
export function wordAt(hex: string, i: number) {
  const body = strip(hex);
  const chunk = body.slice(i * W, (i + 1) * W);
  return chunk ? BigInt(`0x${chunk}`) : 0n;
}

/** Decodes a dynamic `bytes` value whose offset word sits at head index `i`. */
export function decodeBytesAt(hex: string, i = 0): `0x${string}` {
  const body = strip(hex);
  if (body.length < (i + 1) * W) return "0x";
  const offset = Number(wordAt(hex, i)) * 2;
  const len = Number(BigInt(`0x${body.slice(offset, offset + W) || "0"}`));
  return `0x${body.slice(offset + W, offset + W + len * 2)}` as `0x${string}`;
}

export function decodeStringAt(hex: string, i = 0) {
  const raw = decodeBytesAt(hex, i);
  const b = new Uint8Array((raw.length - 2) / 2);
  for (let k = 0; k < b.length; k++) b[k] = Number.parseInt(raw.slice(2 + k * 2, 4 + k * 2), 16);
  return new TextDecoder().decode(b);
}

export const decodeAddressAt = (hex: string, i: number) => `0x${wordAt(hex, i).toString(16).padStart(40, "0")}`;

/** Error selectors of the project contracts and common token errors, in plain words. */
export const REVERTS: Record<string, string> = {
  ...DESK_ERRORS,
  [`0x${selector("EnforcedPause()")}`]: "Buying is paused for the moment. Nothing moved.",
  [`0x${selector("ERC20InsufficientBalance(address,uint256,uint256)")}`]: "Not enough USDG in the wallet.",
  [`0x${selector("ERC20InsufficientAllowance(address,uint256,uint256)")}`]: "The USDG approval is lower than the price.",
  [`0x${selector("SafeERC20FailedOperation(address)")}`]: "USDG refused the transfer. Check the balance and approval.",
};
