# Qoura — Purchase AI compute on-chain. Zero-knowledge proofs hide buyer. Use APIs privately. Non-custodial. Agents autonomous.

**Buy AI. Stay Private. Zero-Knowledge Proof.** Website: https://qoura.xyz · X: https://x.com/qouraxyz · Network: Robinhood Chain (chain id 4663)

## The problem

AI work is increasingly bought by software: agents call models, render images and look things up many times a day.
Card-based AI APIs need an account tied to a person or a company, so every call is filed under that identity.
Paying with stablecoins removes the account, but every on-chain payment is public forever, so a wallet's purchases
become a readable record of what a team or an agent is working on.

## The solution

Qoura splits paying from using.

- You pay for a **credit** in USDG on Robinhood Chain. The payment is public, like any transfer.
- Your browser later builds a **zero-knowledge proof** that you own one unspent credit of that face value, without
  saying which one, and uses it to top up an **API key you generated yourself**.
- You call models and image generators through an **OpenAI-compatible gateway** with that key. Nothing public links
  the key to the wallet that paid.

## How it works

1. **Credit.** Two random numbers (`nullifier`, `secret`) are made on your device. `commitment = Poseidon(nullifier, secret)`.
2. **Pay.** You sign one USDG `ReceiveWithAuthorization` (EIP-3009). A relayer submits it (no ETH needed), or your wallet
   calls `buy` directly. The `QouraCreditDesk` contract forwards the USDG to the treasury in the same transaction and
   appends `leaf = Poseidon(commitment, face)` to an on-chain Merkle tree (depth 20, last 100 roots kept).
3. **Prove.** The browser downloads every leaf, rebuilds the root, checks it against the contract, and proves with a Noir
   circuit (UltraHonk, BN254) that it knows the secrets of some leaf of that face value. Public inputs: root, face,
   spend tag `Poseidon(nullifier)`, and a binding of your key (`sha256(key) >> 8`). About two seconds in a browser.
4. **Redeem.** The gateway asks the contract (`checkRedeem`, a read-only call) whether the proof verifies, records the
   spend tag once, and credits the key whose binding is inside the proof.
5. **Use.** Point any OpenAI client at `https://qoura.xyz/v1`. Each call holds the worst-case cost, then settles to the
   supplier's real cost times the marketplace markup. Only counts and charges are stored, never prompts or outputs.

What is **not** hidden: the purchase itself (wallet, amount, time), timing between paying and redeeming, your IP address,
and request content at the model supplier. Details in the whitepaper page.

**$QOURA:** holding it in the paying wallet lowers the USDG price of each credit. Nothing is staked or locked.

## What you can try

Live now
- Marketplace with live supplier prices for 21 language models, 5 image generators and a search-grounded answer service.
- Wallet connect (browser wallets via EIP-6963 and WalletConnect), live Robinhood Chain data.
- The whole credit flow in practice mode: make a credit, build a real zero-knowledge proof in your browser.

Coming later
- Real purchases and redeems once the credit desk contract is deployed (address published on the site).
- An agent SDK and an MCP server; search results and page reading; code sandboxes and GPU time.

## Run it locally

Download ZIP or fork this repository, then:

```bash
node --version        # Node 20 or newer
npm install
npm run build         # also bundles the browser prover into public/zk
npm start             # http://localhost:5010
```

Optional environment variables (names only, see `.env.example`; put values in `.env.local`, never commit it):

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_QOURA_DESK`, `NEXT_PUBLIC_QOURA_DESK_BLOCK` | Deployed desk address and block; empty = practice mode |
| `OPENROUTER_API_KEY` | Model supplier key for the gateway |
| `QOURA_HOURLY_USD_CAP` | Site-wide hourly supplier spend ceiling (default 50) |
| `QOURA_RELAYER_KEY` | Hot wallet that pays gas for gasless purchases |
| `KV_REDIS_URL` or `KV_REST_API_URL` + `KV_REST_API_TOKEN` | Ledger for key balances and spend tags (must not evict) |
| `ROBINHOOD_RPC_URL`, `NEXT_PUBLIC_ROBINHOOD_RPC_URL` | Private RPC; empty = public RPC |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | WalletConnect project id |

Contracts and circuit:

```bash
cd contracts && ./setup.sh && forge test          # Solidity tests (Foundry)
cd circuits/redeem && nargo test                  # circuit tests (Noir 1.0.0-beta.22)
./circuits/build.sh                               # rebuild circuit, verifier and browser artifact (needs bb)
npm test                                          # TypeScript unit tests
npm run zk:selftest                               # prove and verify a redeem in Node
npm run verify-deployment -- <desk> --tx <hash>   # compare deployed bytecode with this source
```

## Network in your wallet

| Field | Value |
|---|---|
| Network name | Robinhood Chain |
| RPC URL | https://rpc.mainnet.chain.robinhood.com |
| Chain ID | 4663 |
| Currency | ETH |
| Explorer | https://robinhoodchain.blockscout.com |

Connecting on the site adds the network for you.

## Project layout

```
src/app/            pages and API routes (/api/credit/*, /api/v1/* served at /v1/*)
src/components/     UI: market, buy panel, dashboard, wallet dialog
src/config/         brand, catalogue, contract addresses
src/lib/credit/     credit maths, tree, prover worker, contract calls
src/lib/server/     gateway ledger, leaf index, supplier catalogue, relayer signer
contracts/          QouraCreditDesk, QouraRedeemCheck (generated verifier), QouraTwinHash, tests
circuits/redeem/    Noir redeem circuit
scripts/            prover bundling, artifacts, deployment verification
```

## Contracts and token

| Item | Address |
|---|---|
| USDG | `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` |
| QouraCreditDesk | published on the site after deployment |
| $QOURA | published on the site at launch |

## Security and status

- Contracts and circuit are tested (Foundry, Noir, end-to-end proof checks) but **not audited** yet.
- UltraHonk uses a universal public setup; no project-specific trusted setup.
- The desk never holds funds; the owner can pause buying and set holder terms, and cannot touch leaves or payments.
- Credits are not refundable or transferable. Keep your credit backups and keys: they cannot be recovered.

## Contributing

Issues and pull requests are welcome. Please run `npm test`, `npx tsc --noEmit` and `npx eslint` before opening a PR,
and keep code and comments in English.

## License

MIT, see `LICENSE`.
