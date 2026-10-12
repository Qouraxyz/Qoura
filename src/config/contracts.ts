// The one place the credit desk's address lives.
//
// QouraCreditDesk takes USDG for credits and keeps the public tree of every credit sold
// (contracts/src). It does not depend on the $QOURA token: the holder price is switched on later
// with setQouraToken once the CA exists. While DESK is empty the site runs in practice mode: the
// whole flow works, but credits are written to this browser instead of the chain and nothing is paid.
// After the owner deploys from /deploy (localhost only), paste the address and block here and push.
//
// The NEXT_PUBLIC_* variables are only a fallback for local test builds against a devnet or a fork.

const DESK = "";
const DESK_BLOCK = 0;

const isAddr = (v: string) => /^0x[0-9a-fA-F]{40}$/.test(v);
const pick = (fixed: string, env: string | undefined) => (isAddr(fixed) ? fixed : env && isAddr(env) ? env : "");
const pickBlock = (fixed: number, env: string | undefined) => fixed || (env && /^\d+$/.test(env) ? Number(env) : 0);

export const CREDIT_DESK = {
  name: "QouraCreditDesk",
  address: pick(DESK, process.env.NEXT_PUBLIC_QOURA_DESK),
  block: pickBlock(DESK_BLOCK, process.env.NEXT_PUBLIC_QOURA_DESK_BLOCK),
} as const;

export const deskLive = () => CREDIT_DESK.address !== "" && CREDIT_DESK.block > 0;

/** Depth of the credit tree (2^20 ≈ one million credits). Same in the contract and the circuit. */
export const TREE_DEPTH = 20;
