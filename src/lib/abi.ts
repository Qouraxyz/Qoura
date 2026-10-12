/**
 * Just enough Solidity ABI encoding for the swap calls, without a library.
 * Values are hex strings without the 0x prefix, always whole 32-byte words.
 */

export type Part = { head: string } | { tail: string };

const WORD = 64;

export function word(value: bigint | number | boolean) {
  const n = typeof value === "boolean" ? (value ? 1n : 0n) : BigInt(value);
  if (n < 0n) return (2n ** 256n + n).toString(16).padStart(WORD, "0");
  return n.toString(16).padStart(WORD, "0");
}

export function address(value: string) {
  return value.slice(2).toLowerCase().padStart(WORD, "0");
}

/** A static value that sits in the head as one or more words. */
export const fixed = (hex: string): Part => ({ head: hex });
/** A dynamic value: an offset in the head, its encoding in the tail. */
export const dynamic = (hex: string): Part => ({ tail: hex });

/** Encodes a list of arguments (or a tuple's fields) with head/tail layout. */
export function encode(parts: Part[]) {
  const headSize = parts.reduce((size, part) => size + ("head" in part ? part.head.length / 2 : 32), 0);
  let head = "";
  let tail = "";
  for (const part of parts) {
    if ("head" in part) {
      head += part.head;
    } else {
      head += word(headSize + tail.length / 2);
      tail += part.tail;
    }
  }
  return head + tail;
}

/** `bytes`: length word followed by the data, right-padded to a word. */
export function bytes(hex: string) {
  const data = hex.startsWith("0x") ? hex.slice(2) : hex;
  const padded = data.padEnd(Math.ceil(data.length / WORD) * WORD, "0");
  return word(data.length / 2) + padded;
}

/** `bytes[]`: length word followed by the elements as dynamic values. */
export function bytesArray(items: string[]) {
  return word(items.length) + encode(items.map((item) => dynamic(bytes(item))));
}

/** Reads the 32-byte word at `index` of a hex result as an unsigned integer. */
export function readWord(result: string, index: number) {
  const data = result.startsWith("0x") ? result.slice(2) : result;
  const chunk = data.slice(index * WORD, (index + 1) * WORD);
  return chunk ? BigInt(`0x${chunk}`) : 0n;
}

export function readAddress(result: string, index: number) {
  return `0x${readWord(result, index).toString(16).padStart(40, "0")}`;
}

/** Signed read for int24 and friends, which arrive sign-extended to 256 bits. */
export function readInt(result: string, index: number) {
  const value = readWord(result, index);
  return value >= 2n ** 255n ? value - 2n ** 256n : value;
}

/* ------------------------------------------------------------------ QouraCreditDesk */

/** Function selectors of QouraCreditDesk (checked against keccak in src/lib/credit/core.test.ts). A selector alone is the calldata of a no-argument read. */
export const DESK_SIG = {
  buy: "0xd6febde8", // buy(uint256,uint256)
  buyWithAuthorization: "0x3fe4557e", // buyWithAuthorization(uint256,uint256,address,uint256,uint256,uint256,uint8,bytes32,bytes32)
  quote: "0x8f79306e", // quote(address,uint256)
  checkRedeem: "0xed2bb6f6", // checkRedeem(bytes,uint256,uint256,uint256,uint256)
  currentRoot: "0xfdab463d", // currentRoot()
  isKnownRoot: "0xa6232a93", // isKnownRoot(uint256)
  nextIndex: "0xfc7e9c6f", // nextIndex()
  faceCount: "0x850af131", // faceCount(uint256)
  commitmentUsed: "0x05e105b9", // commitmentUsed(uint256)
  authorizationNonce: "0xc3f4b8c8", // authorizationNonce(uint256,uint256)
  paused: "0x5c975abb", // paused()
  treasury: "0x61d027b3", // treasury()
  qouraToken: "0x22a3926c", // qouraToken()
  holderMinBalance: "0xb2a76fac", // holderMinBalance()
  holderDiscountBps: "0x2b6401ac", // holderDiscountBps()
  owner: "0x8da5cb5b", // owner()
  usdg: "0xf5b91b7b", // usdg()
  verifier: "0x2b7ac3f3", // verifier()
  approve: "0x095ea7b3", // ERC-20 approve(address,uint256)
  allowance: "0xdd62ed3e", // ERC-20 allowance(address,address)
  balanceOf: "0x70a08231", // ERC-20 balanceOf(address)
} as const;

/** topic0 of CreditAdded(uint256 indexed index, uint256 commitment, uint256 face, uint256 leaf, uint256 root, uint256 paid, bool holder). */
export const CREDIT_ADDED_TOPIC = "0xc2022f5e009c8f23523d9b5b37be1d339071aa0f54229430e3b2f5f26ccb88d7";

/** Custom errors of QouraCreditDesk (and the OpenZeppelin ones it can raise), by selector. */
export const DESK_ERRORS: Record<string, string> = {
  "0xc38b437f": "That credit commitment is not valid.",
  "0xaa63b930": "That credit commitment was already used.",
  "0x633ca3a7": "Discount too high.",
  "0xd93c0665": "Buying is paused right now.",
  "0x8dfc202b": "Buying is not paused.",
  "0x43023786": "Face value must be 1 to 1000 dollars.",
  "0x1e4fbdf7": "Invalid owner.",
  "0x118cdaa7": "Only the owner can do that.",
  "0x5274afe7": "The USDG transfer failed (balance or allowance too low).",
  "0xe22d1c9e": "The $QOURA token is already set.",
  "0xb48f2cf8": "The credit tree is full.",
  "0x195a3ca1": "The signed amount does not match the current price.",
};

export const encodeDeskBuy = (commitment: bigint, face: number | bigint) => `${DESK_SIG.buy}${word(commitment)}${word(face)}`;

export function encodeDeskBuyWithAuthorization(a: {
  commitment: bigint;
  face: number | bigint;
  from: string;
  value: bigint;
  validAfter: bigint;
  validBefore: bigint;
  v: number;
  r: string;
  s: string;
}) {
  const b32 = (h: string) => h.replace(/^0x/, "").toLowerCase().padStart(WORD, "0");
  return (
    DESK_SIG.buyWithAuthorization +
    word(a.commitment) +
    word(a.face) +
    address(a.from) +
    word(a.value) +
    word(a.validAfter) +
    word(a.validBefore) +
    word(a.v) +
    b32(a.r) +
    b32(a.s)
  );
}

export const encodeDeskQuote = (buyer: string, face: number | bigint) => `${DESK_SIG.quote}${address(buyer)}${word(face)}`;

export const encodeDeskCheckRedeem = (proof: string, root: bigint, face: number | bigint, spendTag: bigint, keyBinding: bigint) =>
  `${DESK_SIG.checkRedeem}${encode([dynamic(bytes(proof)), fixed(word(root)), fixed(word(face)), fixed(word(spendTag)), fixed(word(keyBinding))])}`;

export const encodeDeskIsKnownRoot = (root: bigint) => `${DESK_SIG.isKnownRoot}${word(root)}`;
export const encodeDeskFaceCount = (face: number | bigint) => `${DESK_SIG.faceCount}${word(face)}`;
export const encodeDeskCommitmentUsed = (commitment: bigint) => `${DESK_SIG.commitmentUsed}${word(commitment)}`;
export const encodeApprove = (spender: string, amount: bigint) => `${DESK_SIG.approve}${address(spender)}${word(amount)}`;
export const encodeAllowance = (owner: string, spender: string) => `${DESK_SIG.allowance}${address(owner)}${address(spender)}`;
export const encodeBalanceOfAddress = (owner: string) => `${DESK_SIG.balanceOf}${address(owner)}`;

export type CreditAddedLog = { index: number; commitment: bigint; face: number; leaf: bigint; root: bigint; paid: bigint; holder: boolean };

/** Decodes a CreditAdded log (topics[1] = index, data = 6 words). Returns null for any other log. */
export function decodeCreditAdded(log: { topics: string[]; data: string }): CreditAddedLog | null {
  if (!log.topics?.length || log.topics[0].toLowerCase() !== CREDIT_ADDED_TOPIC || log.topics.length !== 2) return null;
  const data = log.data.startsWith("0x") ? log.data.slice(2) : log.data;
  if (data.length !== 6 * WORD) return null;
  return {
    index: Number(BigInt(log.topics[1])),
    commitment: readWord(data, 0),
    face: Number(readWord(data, 1)),
    leaf: readWord(data, 2),
    root: readWord(data, 3),
    paid: readWord(data, 4),
    holder: readWord(data, 5) === 1n,
  };
}
