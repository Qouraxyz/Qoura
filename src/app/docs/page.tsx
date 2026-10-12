import Link from "next/link";
import type { Metadata } from "next";
import { JsonLd } from "@/components/JsonLd";
import { AddrChip } from "@/components/CopyCa";
import { BRAND, CHAIN, TOKEN, USDG } from "@/config/brand";
import { FACES } from "@/config/catalog";
import { CREDIT_DESK, deskLive } from "@/config/contracts";
import { faqLd, pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  path: "/docs",
  title: `Docs | ${BRAND.name}`,
  description: `How to buy a ${BRAND.name} credit in USDG, redeem it with a zero-knowledge proof for an API key, and call the OpenAI-compatible gateway. API, privacy model and limits.`,
});

const FAQ = [
  {
    q: `What is ${BRAND.name}?`,
    a: `${BRAND.name} is a private AI compute marketplace on ${CHAIN.name}. You buy credits for language models and image generation in USDG, then redeem them with a zero-knowledge proof into an API key that no wallet points to.`,
  },
  {
    q: `How does ${BRAND.name} work?`,
    a: "You pay for a credit in public. Your browser keeps two secret numbers for it. Later it proves, without saying which credit is yours, that you own one unspent credit of that amount, and the proof tops up a key you generated. You then call models through an OpenAI-compatible gateway with that key.",
  },
  {
    q: `How do I buy ${BRAND.symbol}?`,
    a: TOKEN.isLive
      ? `${BRAND.symbol} trades on ${CHAIN.name} at contract ${BRAND.ca}. Check the address on this site before buying anywhere.`
      : `${BRAND.symbol} has not launched yet. Its contract address will be published on this site and on ${BRAND.xHandle} at launch; trust no other source.`,
  },
  {
    q: `Which network is ${BRAND.name} on?`,
    a: `${CHAIN.name}, chain id ${CHAIN.id}. Credits are paid in USDG, the Global Dollar stablecoin on that chain.`,
  },
  {
    q: `Is ${BRAND.name} audited?`,
    a: "Not yet. The credit desk contract and the redeem circuit are tested, and their source is published for review, but no third-party audit has been completed.",
  },
  {
    q: "Do I need ETH for gas?",
    a: "Not when the gasless relayer is on: you sign one USDG authorization and the relayer pays the gas. Without it, your wallet approves USDG and pays the purchase transaction itself, which needs a little ETH.",
  },
];

const API: [string, string, string][] = [
  ["GET", "/v1/listings", "Catalogue as JSON: maker, category, marked-up price and the path that serves each listing."],
  ["GET", "/v1/models", "Model ids in the OpenAI list format, handy for SDK dropdowns."],
  ["POST", "/v1/chat/completions", "Chat in the OpenAI schema. Needs a bearer key; set stream: true for server-sent events. Header x-charge-usd states what was billed."],
  ["POST", "/v1/images/generations", "Pictures. JSON {model, prompt, n?, aspect_ratio?} with n up to 4; results inline as base64."],
  ["GET", "/v1/key", "Remaining balance for the bearer key and up to 50 recent requests (usage and cost only)."],
  ["GET", "/v1/credits", "Preset face values, set size per value, payment chain and token, tree size, prover file paths."],
  ["GET", "/api/credit/leaves?from=N", "Ordered leaf list in pages of 5,000, so any client can recompute the root."],
  ["POST", "/api/credit/relay", "Relays a signed USDG ReceiveWithAuthorization for a commitment; responds with the transaction hash."],
  ["POST", "/api/credit/redeem", "JSON {proof, root, face, spendTag, keyBinding}. Verified by the desk contract, then credited to that binding."],
];

export default function DocsPage() {
  return (
    <div className="wrap pt-14 md:pt-20">
      <JsonLd data={faqLd(FAQ)} />
      <h1 className="display">Docs</h1>
      <p className="lede mt-5 max-w-3xl">Three moves: pay for a credit, turn it into key balance, send requests. The website is only a client of the endpoints below; scripts can use them directly.</p>

      <div className="mt-14 grid grid-cols-1 gap-12 lg:grid-cols-[200px_1fr]">
        <nav aria-label="On this page" className="lg:sticky lg:top-24 lg:self-start">
          <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-[13.5px] lg:flex-col">
            {[
              ["start", "Getting started"],
              ["images", "Pictures"],
              ["agents", "Automation"],
              ["api", "Endpoint reference"],
              ["credits", "Credit mechanics"],
              ["privacy", "Privacy model"],
              ["limits", "Rules and caps"],
              ["contracts", "Contracts"],
              ["faq", "Questions"],
            ].map(([id, label]) => (
              <li key={id}>
                <a href={`#${id}`} className="text-mute hover:text-ink">
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <article className="doc max-w-3xl min-w-0">
          <h2 id="start" className="!mt-0">
            Getting started
          </h2>
          <ol>
            <li>
              Open any listing in the <Link href="/market">marketplace</Link>, choose a face value (smallest is ${FACES[0]}) and approve the USDG
              signature on {CHAIN.name}.
            </li>
            <li>
              Go to the <Link href="/account">dashboard</Link> and press redeem. A proof is computed locally and a fresh key receives the balance.
            </li>
            <li>Configure your OpenAI SDK with base URL {BRAND.url}/v1 and the new key.</li>
          </ol>
          <pre className="code">{`curl ${BRAND.url}/v1/chat/completions \\
  -H "Authorization: Bearer qk-..." \\
  -H "Content-Type: application/json" \\
  -d '{"model": "gpt-oss-120b", "max_tokens": 400,
       "messages": [{"role": "user", "content": "List three risks in this plan"}]}'`}</pre>
          <pre className="code">{`from openai import OpenAI

qoura = OpenAI(base_url="${BRAND.url}/v1", api_key="qk-...")
answer = qoura.chat.completions.create(
    model="deepseek-v4-flash",
    max_tokens=400,
    messages=[{"role": "user", "content": "Draft a release note"}],
)
print(answer.choices[0].message.content)`}</pre>
          <p>Billing per request equals the supplier&apos;s cost for it multiplied by the markup, debited from the key.</p>

          <h3 id="images">Pictures</h3>
          <p>Image listings answer on a separate path, still authenticated by the same key, and bill per request.</p>
          <pre className="code">{`curl ${BRAND.url}/v1/images/generations \\
  -H "Authorization: Bearer qk-..." \\
  -H "Content-Type: application/json" \\
  -d '{"model": "gemini-3.1-flash-image", "aspect_ratio": "3:2",
       "prompt": "Fog over a frozen harbour at dawn, film grain"}'`}</pre>
          <p>
            Results are inline: each entry in <code>data</code> holds <code>b64_json</code> plus its <code>mime_type</code>. Nothing is stored
            server-side, so no URLs are issued.
          </p>

          <h2 id="agents">Automation</h2>
          <p>
            A script or agent with USDG can complete the full cycle unattended: discover listings at <code>/v1/listings</code>, pay, prove, redeem,
            call. Since quick pay-then-redeem sequences are easy to correlate, check <code>/v1/credits</code> for the size of each face-value set
            before redeeming. More on the <Link href="/agents">agents page</Link>.
          </p>

          <h2 id="api">Endpoint reference</h2>
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Method</th>
                  <th>Path</th>
                  <th>Purpose</th>
                </tr>
              </thead>
              <tbody>
                {API.map(([m, p, d]) => (
                  <tr key={p}>
                    <td className="font-mono text-[12.5px]">{m}</td>
                    <td className="font-mono text-[12.5px] whitespace-nowrap">{p}</td>
                    <td>{d}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            Failures return the familiar OpenAI envelope <code>{`{"error": {...}}`}</code>. Status 402 with <code>insufficient_balance</code>{" "}
            means the key needs topping up.
          </p>

          <h2 id="credits">Credit mechanics</h2>
          <p>
            Two locally generated numbers make up a credit. Their hash, the commitment, travels with your payment; the desk contract then stores{" "}
            <code>Poseidon(commitment, face)</code> as a new leaf, taking the face value from the USDG it received. Redeeming means proving
            knowledge of one leaf&apos;s preimage under a root the contract recognises. The proof exposes <code>Poseidon(nullifier)</code>, which
            the server records to block reuse, and the binding of your key, which decides who gets paid. Details in the{" "}
            <Link href="/whitepaper">whitepaper</Link>.
          </p>

          <h2 id="privacy">Privacy model</h2>
          <h3>Protected</h3>
          <p>
            The pairing between a payment and a key. Any credit with the same face value is an equally likely source; the buy panel and the
            dashboard display that set size. Rare face values make small sets.
          </p>
          <h3>Not protected</h3>
          <ul>
            <li>Payments themselves: payer, value and time live on {CHAIN.name}.</li>
            <li>Timing correlation, especially redeeming right after paying or being the sole buyer of a value.</li>
            <li>Your IP address toward this site, both when redeeming and when calling.</li>
          </ul>
          <h3>Model traffic</h3>
          <p>
            Requests reach third-party suppliers via the gateway. Suppliers process content without learning your key, address or wallet. The
            gateway retains listing, usage counts and cost, never message bodies or images.
          </p>

          <h2 id="limits">Rules and caps</h2>
          <ul>
            <li>{BRAND.name} issues the credits; they work only on this gateway and are not a deposit with any AI lab.</li>
            <li>No refunds and no transfers, for credits or for key balances.</li>
            <li>Secrets live in your browser only. Export backups; nobody can recover lost ones.</li>
            <li>Omitting max_tokens caps a reply at 8,192 tokens, or lower when the balance is smaller.</li>
          </ul>

          <h2 id="contracts">Contracts</h2>
          <table>
            <tbody>
              <tr>
                <th>Credit desk</th>
                <td>{deskLive() ? <AddrChip address={CREDIT_DESK.address} /> : "Not deployed yet. The site runs in practice mode until it is."}</td>
              </tr>
              <tr>
                <th>USDG</th>
                <td>
                  <AddrChip address={USDG.address} />
                </td>
              </tr>
              <tr>
                <th>{BRAND.symbol}</th>
                <td>{TOKEN.isLive ? <AddrChip address={BRAND.ca} /> : "Contract address coming soon."}</td>
              </tr>
            </tbody>
          </table>

          <h2 id="faq">Questions</h2>
          {FAQ.map((f) => (
            <div key={f.q}>
              <h3>{f.q}</h3>
              <p>{f.a}</p>
            </div>
          ))}
        </article>
      </div>
    </div>
  );
}
