import type { Metadata } from "next";
import { TreeNow } from "@/components/TreeNow";
import { BRAND, CHAIN, USDG } from "@/config/brand";
import { MARKUP } from "@/config/catalog";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  path: "/whitepaper",
  title: `Whitepaper | ${BRAND.name}`,
  description: `How ${BRAND.name} works: USDG credits on ${CHAIN.name}, an on-chain credit tree, a zero-knowledge redeem proof, the gateway, who sees what, and what stays visible.`,
  type: "article",
});

const TOC = [
  ["summary", "Summary"],
  ["case", "Why this exists"],
  ["goals", "Design goals"],
  ["shelf", "The catalogue"],
  ["credit", "Anatomy of a credit"],
  ["buying", "Paying"],
  ["redeeming", "Redeeming"],
  ["gateway", "The gateway"],
  ["exposure", "Who sees what"],
  ["gaps", "What stays visible"],
  ["trust", "Trust assumptions"],
  ["agents", "Agents"],
  ["ahead", "Roadmap"],
] as const;

const SEES: [string, string, string, string][] = [
  ["Payer address, amount, block time", "Visible", "Visible", "Hidden"],
  ["Link between a payment and a key", "Hidden", "Hidden; it learns only the face value", "Hidden"],
  ["API key", "Hidden", "A 248-bit binding when topping up; the key on each request", "Hidden"],
  ["Request and response content", "Hidden", "Relayed in memory, never written to storage", "Visible, since it runs the model"],
  ["Item, token counts, charge", "Hidden", "Visible per key", "Visible for its own calls"],
  ["Network address of the caller", "Hidden", "Seen by the hosting edge like any website; kept out of the ledger", "Hidden"],
];

export default function WhitepaperPage() {
  return (
    <div className="wrap pt-14 md:pt-20">
      <p className="tag">October 2026 · version 1</p>
      <h1 className="display mt-4">Whitepaper</h1>
      <p className="lede mt-5 max-w-3xl">
        A technical account of {BRAND.name}: the contract, the circuit, the gateway and the places where privacy ends. Written for people who
        would rather check than trust.
      </p>

      <div className="mt-14 grid grid-cols-1 gap-12 lg:grid-cols-[220px_1fr]">
        <nav aria-label="Contents" className="lg:sticky lg:top-24 lg:self-start">
          <ol className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[13.5px] sm:grid-cols-3 lg:grid-cols-1">
            {TOC.map(([id, label], i) => (
              <li key={id}>
                <a href={`#${id}`} className="text-mute hover:text-ink">
                  <span className="mr-2 font-mono text-[11px] text-faint">{String(i + 1).padStart(2, "0")}</span>
                  {label}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <article className="doc max-w-3xl min-w-0">
          <h2 id="summary" className="!mt-0">
            Summary
          </h2>
          <p>
            AI workloads increasingly purchase their own inputs: tokens, images, lookups and, soon, runtime. Software can custody a stablecoin far
            more easily than it can obtain a bank card, but stablecoin transfers are permanent public records. Paying for compute that way
            publishes a running diary of what a project does and who funds it.
          </p>
          <p>
            {BRAND.name} separates the two halves. Paying for a credit happens openly on {CHAIN.name}. Spending it happens through an API key that
            was topped up by a zero-knowledge proof, and that proof establishes only that its holder owns some unspent credit of a stated face
            value. The seller collects, the caller is served, and no public record joins them.
          </p>

          <h2 id="case">Why this exists</h2>
          <p>Three trends meet here.</p>
          <ol>
            <li>
              <strong>Autonomous spending.</strong> A single agent run can involve hundreds of paid calls worth fractions of a cent. No human signs
              off on each.
            </li>
            <li>
              <strong>Identity-first billing.</strong> Conventional AI APIs bill an account tied to a person or company. An agent uses its
              operator&apos;s, so its whole activity is filed under that operator.
            </li>
            <li>
              <strong>Readable ledgers.</strong> Spend patterns reveal strategy: which models, how often, how much. A transparent chain keeps that
              pattern open to competitors and observers indefinitely.
            </li>
          </ol>
          <p>
            Paying with stablecoins removes the account and the card. It also makes the third problem sharper. Unlinking payment from use is the
            piece that closes the gap.
          </p>

          <h2 id="goals">Design goals</h2>
          <table>
            <tbody>
              <tr>
                <th>Accountless</th>
                <td>Paying requires a wallet; spending requires a key. There is no sign-up, email or profile anywhere.</td>
              </tr>
              <tr>
                <th>Scriptable</th>
                <td>Buying, proving, redeeming and calling are all plain HTTP requests or contract calls.</td>
              </tr>
              <tr>
                <th>Unlinkable</th>
                <td>Neither the operator nor a chain analyst can match a key to the transfer that financed it.</td>
              </tr>
              <tr>
                <th>Non-custodial</th>
                <td>The desk contract forwards USDG to the treasury inside the purchase transaction and never sits on a balance.</td>
              </tr>
              <tr>
                <th>Integer money</th>
                <td>
                  All amounts are counted in USDG base units ({USDG.decimals} decimals); discounts round up by at most one unit, never in floating
                  point.
                </td>
              </tr>
              <tr>
                <th>Honest copy</th>
                <td>Every limitation below is also stated on the pages where it matters.</td>
              </tr>
            </tbody>
          </table>

          <h2 id="shelf">The catalogue</h2>
          <p>
            Listings are grouped by job: <em>Reason</em> (language models, metered per token), <em>Render</em> (image generation, metered per
            call), <em>Look up</em> (search-grounded answers today; raw results and page extraction later) and <em>Execute</em> (sandboxes and GPU
            time, on the roadmap).
          </p>
          <p>
            One credit pays for any listing. Deliberately so: if credits were item-specific, the item would shrink the set of possible owners. As
            built, a redeem blends in with every purchase of the same face value regardless of later use. Third-party model suppliers serve the
            listings; displayed prices are their rates multiplied by a single factor of {MARKUP.toFixed(2)}.
          </p>
          <p>Credits are a {BRAND.name} product: usable only on this gateway, with no refund and no transfer.</p>

          <h2 id="credit">Anatomy of a credit</h2>
          <table>
            <tbody>
              <tr>
                <th>Secrets</th>
                <td>
                  <code>nullifier</code> and <code>secret</code>, two field elements drawn from 31 random bytes each on the purchaser&apos;s machine.
                  Holding them is owning the credit.
                </td>
              </tr>
              <tr>
                <th>Commitment</th>
                <td>
                  <code>Poseidon(nullifier, secret)</code>. Published with the payment; a hiding, binding fingerprint of the secrets.
                </td>
              </tr>
              <tr>
                <th>Leaf</th>
                <td>
                  <code>Poseidon(commitment, face)</code>. Computed by the contract from the amount it actually received, so face value is never
                  self-reported.
                </td>
              </tr>
              <tr>
                <th>Tree</th>
                <td>Incremental Poseidon Merkle tree, 20 levels, around 1.05 million slots, stored on chain together with its 100 latest roots.</td>
              </tr>
              <tr>
                <th>Spend tag</th>
                <td>
                  <code>Poseidon(nullifier)</code>. Deterministic per credit, which blocks double redemption, yet unrelated to any leaf since the
                  nullifier itself is never published.
                </td>
              </tr>
            </tbody>
          </table>

          <h2 id="buying">Paying</h2>
          <p>Paying is deliberately unremarkable: a token transfer that anyone can observe.</p>
          <ol>
            <li>The browser generates the secrets, stores them locally, and derives the commitment.</li>
            <li>
              The purchaser signs a USDG <code>ReceiveWithAuthorization</code> (EIP-3009) for the desk&apos;s exact quote. The signed nonce is{" "}
              <code>keccak256(desk, commitment, face)</code>; replaying the signature with a different commitment fails.
            </li>
            <li>
              A relayer submits <code>buyWithAuthorization</code>, covering gas. The contract collects the USDG, passes it to the treasury, and
              inserts the leaf, all in one transaction. A fallback path lets the purchaser approve and call <code>buy</code> themselves.
            </li>
          </ol>
          <p>
            Preset face values (1, 2, 5, 10 and 25 dollars) concentrate buyers. Any integer up to 1,000 is accepted, with the caveat in{" "}
            <a href="#gaps">what stays visible</a>.
          </p>

          <h2 id="redeeming">Redeeming</h2>
          <p>Redemption converts a credit into key balance. Nothing in the request identifies a wallet, a session or a device.</p>
          <ol>
            <li>
              The purchaser creates a key locally (<code>qk-</code> plus 48 hex characters). The server later receives only{" "}
              <code>sha256(key) &gt;&gt; 8</code> during redemption.
            </li>
            <li>
              The browser fetches the full leaf list, recomputes the root, and halts unless the contract confirms that root. Requesting a single
              Merkle path would reveal the leaf, so it never does.
            </li>
            <li>
              A Noir circuit, proven with UltraHonk over BN254, exposes four public inputs: root, face value, spend tag and key binding. Private
              inputs are the two secrets and the Merkle path. Browser proving takes roughly two seconds.
            </li>
            <li>
              The server asks the desk contract, through a read-only call, to confirm the root and verify the proof, then stores the spend tag
              permanently and credits the binding embedded in the proof. Intercepting a proof is useless: it only pays the original key.
            </li>
          </ol>

          <h2 id="gateway">The gateway</h2>
          <p>
            Requests follow the OpenAI schema, so the only client change is the base URL and key. Before forwarding, the gateway reserves the
            maximum the request could cost in a single atomic decrement; after the response it bills the supplier&apos;s reported cost times the
            markup and releases the remainder. Supplier failures bill nothing. The ledger keeps item, token counts and amount per call. Request
            and response bodies are never persisted.
          </p>

          <h2 id="exposure">Who sees what</h2>
          <p>Zero knowledge covers exactly one relationship, payment to key. The table lists the rest.</p>
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th />
                  <th>Chain observers</th>
                  <th>{BRAND.name}</th>
                  <th>Model supplier</th>
                </tr>
              </thead>
              <tbody>
                {SEES.map(([what, chain, us, supplier]) => (
                  <tr key={what}>
                    <th>{what}</th>
                    <td>{chain}</td>
                    <td>{us}</td>
                    <td>{supplier}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3>Live tree</h3>
          <p>Pulled from the contract. Face value is a public input, so each value forms a separate anonymity set.</p>
          <TreeNow />

          <h2 id="gaps">What stays visible</h2>
          <ul>
            <li>
              <strong>Payments.</strong> Address, amount and timestamp of every purchase are on chain.
            </li>
            <li>
              <strong>Thin sets.</strong> A face value bought once has an anonymity set of one. Presets exist to avoid that.
            </li>
            <li>
              <strong>Correlated timing.</strong> Purchase followed quickly by redemption invites a match, whatever the set size.
            </li>
            <li>
              <strong>IP correlation.</strong> Paying and redeeming over one connection ties them together off chain.
            </li>
            <li>
              <strong>Key reuse.</strong> All traffic on one key shares a pseudonym. Unrelated workloads deserve separate keys.
            </li>
            <li>
              <strong>Supplier view.</strong> The supplier processes request content but receives it from {BRAND.name}, without key, wallet or
              origin address.
            </li>
          </ul>
          <p>
            Best practice: choose a preset, let the set grow before redeeming, redeem over a different connection, and give each workload its own
            key.
          </p>

          <h2 id="trust">Trust assumptions</h2>
          <ul>
            <li>
              <strong>Unlinkability rests on cryptography.</strong> Root checking and key binding happen client-side against the contract;
              operator misbehaviour cannot break them.
            </li>
            <li>
              <strong>Soundness rests on a public setup.</strong> UltraHonk relies on a universal reference string from a large multi-party
              ceremony rather than one produced by this team; one honest participant suffices.
            </li>
            <li>
              <strong>Gateway discretion is a promise.</strong> Traffic transits {BRAND.name}. The software keeps only metering data, which outsiders
              cannot independently verify.
            </li>
            <li>
              <strong>Suppliers see content.</strong> They are trusted with request bodies and with nothing that identifies callers. Serving inside
              hardware enclaves is planned, not shipped.
            </li>
            <li>
              <strong>You keep your secrets.</strong> Lost backups or keys mean lost balance; there is no recovery path.
            </li>
          </ul>
          <p>Status: contract and circuit are tested and published, but no external audit has been completed.</p>

          <h2 id="agents">Agents</h2>
          <p>
            Every step above is machine-executable, so a bot holding USDG can run the whole cycle unattended. The <a href="/agents">agents page</a>{" "}
            covers integration and the controls an operator retains.
          </p>

          <h2 id="ahead">Roadmap</h2>
          <ul>
            <li>Agent tooling: an SDK and an MCP server that purchase, wait for a healthy anonymity set, prove and redeem automatically.</li>
            <li>Separate meters for search results and page extraction, then code sandboxes and GPU time.</li>
            <li>Multiple suppliers per listing with price and latency competition.</li>
            <li>Enclave-backed serving where suppliers offer it.</li>
            <li>Shielded payment for the purchase step once the chain supports it.</li>
          </ul>
        </article>
      </div>
    </div>
  );
}
