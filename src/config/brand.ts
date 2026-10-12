// Single place to change project identity. Everything on the site reads from here.
// To publish the real contract address, replace the value of CA below. The
// navbar copy button, the footer, the token page and every explorer link
// derive from it. Anything that is not a 0x + 40 hex address is
// treated as "not launched yet".

const CA = "0xxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
// Pair the chart button opens on DEXTools: the token's Pons curve while it trades
// there. After graduation, swap in the address of the pair DEXTools lists for the pool.
const CHART_PAIR = "";

export const isAddress = (v: string): v is `0x${string}` =>
  /^0x[0-9a-fA-F]{40}$/.test(v);

const NAME = "Qoura";
const SLUG = "qoura";
const TICKER = "QOURA";
const DOMAIN = "qoura.xyz";
const X_HANDLE = "qouraxyz";

export const BRAND = {
  name: NAME,
  /** Lowercase id for package names and the like. Never used for stored keys (those are neutral). */
  slug: SLUG,
  ticker: TICKER,
  symbol: `$${TICKER}`,
  domain: DOMAIN,
  url: `https://${DOMAIN}`,
  slogan: "Buy AI. Stay Private. Zero-Knowledge Proof.",
  tagline:
    "Purchase AI compute on-chain. Zero-knowledge proofs hide buyer. Use APIs privately. Non-custodial. Agents autonomous.",
  category: "private AI compute marketplace",
  chainName: "Robinhood Chain",
  description: `${NAME} is a private AI compute marketplace on Robinhood Chain. Buy credits for models and image generation in USDG, then redeem them with a zero-knowledge proof into an API key no wallet points to.`,
  x: `https://x.com/${X_HANDLE}`,
  xHandle: `@${X_HANDLE}`,
  // Public source repository. Kept off the site until the owner publishes it.
  github: "https://github.com/Qouraxyz/Qoura",
  ca: CA,
} as const;

/** True once BRAND.github points at an actual repository, not the bare host. */
export const hasGithub = /^https:\/\/github\.com\/[^/]+/.test(BRAND.github);

// Public endpoints are the default. An operator can point the site at a
// private RPC with ROBINHOOD_RPC_URL (server) / NEXT_PUBLIC_ROBINHOOD_RPC_URL
// (browser). Both are optional.
const PUBLIC_RPC = "https://rpc.mainnet.chain.robinhood.com";

export const CHAIN = {
  id: 4663,
  hex: "0x1237",
  name: "Robinhood Chain",
  nativeSymbol: "ETH",
  decimals: 18,
  publicRpc: PUBLIC_RPC,
  rpc: process.env.NEXT_PUBLIC_ROBINHOOD_RPC_URL || PUBLIC_RPC,
  /** Second public endpoint, used for reads only when the first one fails. */
  fallbackRpc: "https://robinhood-rpc.publicnode.com",
  /** Third read endpoint for server code (some networks intercept the official host). */
  spareRpc: "https://robinhood.drpc.org",
  explorer: "https://robinhoodchain.blockscout.com",
} as const;

/** RPC for server code: the private endpoint when set, else the public one. */
export function serverRpc() {
  return (
    process.env.ROBINHOOD_RPC_URL ||
    process.env.NEXT_PUBLIC_ROBINHOOD_RPC_URL ||
    PUBLIC_RPC
  );
}

export const TOKEN = {
  get isLive() {
    return isAddress(BRAND.ca);
  },
  get explorerUrl() {
    return isAddress(BRAND.ca) ? explorerToken(BRAND.ca) : null;
  },
  get chartUrl() {
    return isAddress(BRAND.ca) && isAddress(CHART_PAIR)
      ? `https://www.dextools.io/app/robinhood/pair-explorer/${CHART_PAIR}`
      : null;
  },
};

export function explorerAddress(address: string) {
  return `${CHAIN.explorer}/address/${address}`;
}
export function explorerToken(address: string) {
  return `${CHAIN.explorer}/token/${address}`;
}
export function shortAddress(address: string, head = 6, tail = 4) {
  if (address.length <= head + tail + 2) return address;
  return `${address.slice(0, head)}…${address.slice(-tail)}`;
}

/**
 * USDG ("Global Dollar") on Robinhood Chain. Read on-chain: symbol USDG, name "Global Dollar", 6 decimals.
 */
export const USDG = {
  address: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
  symbol: "USDG",
  name: "Global Dollar",
  decimals: 6,
} as const;

export const WETH = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73";
