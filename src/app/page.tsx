import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, EyeOff, Eye } from "lucide-react";
import { CaPlate } from "@/components/CopyCa";
import { LiveCredits, LiveValue } from "@/components/live";
import { CATEGORIES, FACES, itemsIn } from "@/config/catalog";
import { BRAND, CHAIN } from "@/config/brand";

const FLOW = [
  { n: "01", t: "Browse", d: "Every model and image renderer on the shelf shows its price per million tokens or per picture before you spend a cent." },
  { n: "02", t: "Pay", d: "Buy a credit with USDG. One signed message moves the stablecoin; a relayer carries it on chain, so you hold no ETH for gas." },
  { n: "03", t: "Prove", d: "A proof computed on your own machine shows you hold one unspent credit at that face value, and stays silent about which." },
  { n: "04", t: "Redeem", d: "The proof tops up an API key you generated locally. The key is born with no wallet, no email and no account behind it." },
  { n: "05", t: "Call", d: "Use the key with any OpenAI-style SDK by swapping the base URL. Every reply or picture is debited from its balance." },
];

const HIDDEN = [
  { t: "Which purchase paid for a key", d: "The proof says the credit belongs to the set of all credits bought at that face value. Nothing in it narrows the set." },
  { t: "Who is making the calls", d: "A key is a random string your device made. Only its hash crosses the wire at redeem time, and no account stands behind it." },
  { t: "Which wallet owns the balance", d: "Balances live on the key, not the wallet. Holding a key is the only way to spend it." },
];
const VISIBLE = [
  { t: "The purchase itself", d: "Paying moves USDG in plain sight. Anyone can look up the payer address, the sum and the block it landed in." },
  { t: "Timing and network", d: "Zero knowledge says nothing about the clock or your IP. Letting time pass and switching connections before redeeming helps." },
  { t: "Requests on their way through", d: "Each request passes through the gateway on its way to a supplier. Usage numbers and cost are logged; message bodies are not." },
  { t: "Prompts at the supplier", d: "Whoever hosts the model processes your text. It only ever talks to the gateway, so it learns nothing about who asked." },
];

const STAGES = [
  { when: "Now", t: "Models and images", d: "Text and picture listings, stablecoin credits, the OpenAI-style gateway, browser proving and the credit tree held by the contract." },
  { when: "Next", t: "The agent kit", d: "Web search and page reading on their own meters, plus an SDK and MCP server so agents can buy and spend unattended." },
  { when: "Later", t: "Many sellers", d: "Several hosts per listing bidding on cost and latency, budget rules for bots, and a shielded payment step once the chain can carry one." },
  { when: "Later", t: "Raw compute", d: "Code sandboxes by the second, then GPU time, fine-tuning runs and other work whose result can be checked." },
];

const USERS = [
  { t: "Agents and bots", d: "Buy their own compute from a funded wallet. The operator who runs them stays out of the trail." },
  { t: "Traders", d: "Ask models about strategy without a wallet that ties the questions to a book." },
  { t: "Developers", d: "Ship features on open models through a familiar API, without handing over a card or an identity." },
  { t: "Researchers", d: "Compare many models from one balance, without an account that records the whole study." },
  { t: "Privacy-minded people", d: "Use AI without a profile building up behind every prompt." },
  { t: "Companies", d: "Keep compute spend from mapping, line by line, onto the entity that pays for it." },
];

const HOME_FAQ = [
  {
    q: `What exactly is ${BRAND.name}?`,
    a: `A marketplace for AI compute that settles on ${CHAIN.name}. You prepay in USDG for credits, convert them into balance on an API key through a zero-knowledge proof, and use that key with any OpenAI-compatible client. The point is that the key cannot be traced back to the wallet that paid.`,
  },
  {
    q: "Which models can I use?",
    a: "Open and open-weight language models from DeepSeek, Qwen, Moonshot, Z.ai, Meta, Mistral, Google and OpenAI, plus several image generators and a search-grounded answer service. Prices follow the hosting suppliers live and are shown per million tokens or per picture.",
  },
  {
    q: "Why would a proof make me private if my payment is public?",
    a: "Because the proof refers to a set, not to you. It shows that the holder owns one unspent credit of a given face value without naming the leaf. Everyone who bought that same value is an equally plausible owner, so the bigger and older the set, the weaker any guess.",
  },
  {
    q: "Do I need ETH, an account, or an email?",
    a: "No account and no email, ever. With the gasless relayer on, you only sign a USDG authorization and need no ETH; without it, your wallet pays a small gas fee for approve and buy. Redeeming and calling the API need no wallet at all.",
  },
  {
    q: `Can ${BRAND.name} see my prompts?`,
    a: "Requests pass through the gateway to reach the model supplier, so they exist in memory for the length of the call. The gateway writes down only the listing, token counts and cost. The supplier processes the text but receives it from the gateway, never from your address or key.",
  },
  {
    q: "What happens if I lose my browser data?",
    a: "Credits and keys exist only on your side, which is what makes them private. Lose them and the balance is gone, so export the backup string after every purchase and copy each key somewhere safe.",
  },
  {
    q: `What does ${BRAND.symbol} do?`,
    a: `Holding ${BRAND.symbol} in the wallet that pays lowers the USDG price of every credit. Nothing is staked or locked, the balance is read once at purchase, and discounted credits look exactly like full-price ones once they are in the tree.`,
  },
  {
    q: "How long should I wait before redeeming?",
    a: "There is no fixed rule, only a trade-off. Each extra purchase at your face value makes your credit harder to single out, and every hour between paying and redeeming blurs the timing. Check the set size shown on the buy panel and in the dashboard; for routine use, waiting until a few dozen others share your amount is a sensible habit, and redeeming over a different network adds more distance.",
  },
  {
    q: "Has the contract been audited?",
    a: "Not yet. The desk contract and the redeem circuit are tested and their source is public, but no independent audit has been completed. Start with small credits.",
  },
];

export default function Home() {
  return (
    <>
      {/* Hero: text on the left over a fading panorama, the four shelves as a strip that overlaps its lower edge. */}
      <section className="relative overflow-hidden">
        <Image src="/art/hero.webp" alt="Glass slabs holding a sphere, a cube and a lattice of beads over still water in a misty mountain range" fill priority sizes="100vw" className="object-cover object-[70%_50%] opacity-90" />
        <div className="absolute inset-0 bg-gradient-to-r from-paper via-paper/80 to-transparent md:via-paper/55" aria-hidden="true" />
        <div className="wrap relative pt-16 pb-36 md:pt-24 md:pb-44">
          <p className="tag animate-rise">Zero-knowledge marketplace on {CHAIN.name}</p>
          <h1 className="display mt-5 max-w-[14ch] animate-rise">
            {BRAND.name}. Buy AI, stay <b>private</b>.
          </h1>
          <p className="lede mt-6 max-w-[34rem] animate-rise">
            {BRAND.name} sells model and image compute for USDG. A zero-knowledge proof then separates what you bought from the wallet that paid,
            so the key you spend with leads nowhere.
          </p>
          <div className="mt-8 flex flex-wrap gap-3 animate-rise">
            <Link href="/market" className="btn">
              Open the marketplace <ArrowRight size={15} />
            </Link>
            <Link href="#flow" className="btn-line">
              See the flow
            </Link>
          </div>
          <dl className="mt-12 grid max-w-xl grid-cols-3 gap-4 border-t border-line pt-5 font-mono text-[12px]">
            <div>
              <dt className="text-mute">Block</dt>
              <dd className="mt-1 text-[15px] text-ink">
                <LiveValue field="block" testid="hero-block" />
              </dd>
            </div>
            <div>
              <dt className="text-mute">Credits sold</dt>
              <dd className="mt-1 text-[15px] text-ink">
                <LiveCredits testid="hero-credits" />
              </dd>
            </div>
            <div>
              <dt className="text-mute">ETH</dt>
              <dd className="mt-1 text-[15px] text-ink">
                $<LiveValue field="ethUsd" digits={0} />
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <section aria-label="Shelves" className="wrap relative -mt-24 md:-mt-28">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {CATEGORIES.map((c) => {
            const count = itemsIn(c.key).filter((i) => i.status !== "planned").length;
            return (
              <Link key={c.key} href={`/market?category=${c.key}`} className="group tile overflow-hidden transition-transform hover:-translate-y-0.5">
                <div className="relative aspect-[5/4] overflow-hidden">
                  <Image src={c.art} alt="" fill sizes="(min-width: 768px) 25vw, 50vw" className="object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
                </div>
                <div className="flex items-end justify-between gap-2 px-4 py-3">
                  <div className="min-w-0">
                    <span className="tag text-[10px]">{c.verb}</span>
                    <h2 className="text-[15px] font-medium tracking-tight">{c.label}</h2>
                  </div>
                  <span className="shrink-0 text-[12px] text-mute">{c.live ? `${count} on sale` : "Planned"}</span>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Agents: statement left, the crowd image right. */}
      <section className="wrap mt-28 grid items-center gap-10 md:grid-cols-[1.1fr_1fr] md:gap-16">
        <div>
          <h2 className="title">
            Machines are becoming customers. {BRAND.name} lets them shop <b>without a name</b>.
          </h2>
          <p className="lede mt-5">
            An agent cannot pass a card check or fill in a sign-up form. It can hold stablecoins. Here it spends them on its own, and nothing on the
            chain draws a line from its purchases back to the person or company running it.
          </p>
          <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-mute">
            The same holds for people. A trader asking a model about positions, a lab comparing a dozen models for a paper, a startup prototyping a
            feature before announcing it: each leaves a trail when compute is billed to a named account. Here the trail stops at a stablecoin
            payment that says how much was spent, and nothing about what for.
          </p>
          <Link href="/agents" className="link mt-5 inline-flex items-center gap-1.5 text-[15px]">
            Built for agents <ArrowUpRight size={15} />
          </Link>
        </div>
        <figure className="tile overflow-hidden">
          <div className="relative aspect-[4/3]">
            <Image src="/art/crowd.webp" alt="A frosted glass slab holding a lattice of identical beads, a few of them dark" fill sizes="(min-width: 768px) 45vw, 100vw" className="object-cover" />
          </div>
          <figcaption className="grid grid-cols-5 border-t border-line font-mono text-[11.5px]">
            {FACES.map((f) => (
              <div key={f} className="border-r border-line px-2 py-3 text-center last:border-r-0">
                <span className="block text-mute">${f} crowd</span>
                <span className="mt-0.5 block text-[14px] text-ink">
                  <LiveCredits face={f} />
                </span>
              </div>
            ))}
          </figcaption>
        </figure>
      </section>

      {/* The flow: sticky heading on the left, numbered steps on the right. */}
      <section id="flow" className="wrap mt-32 grid gap-10 md:grid-cols-[0.8fr_1.2fr] md:gap-16">
        <div className="md:sticky md:top-28 md:self-start">
          <h2 className="title">From a price tag to a reply.</h2>
          <p className="mt-4 max-w-sm text-[15px] text-mute">
            Five steps. Only the second one is written to the chain; the proof stands between it and everything after.
          </p>
          <p className="mt-4 max-w-sm text-[15px] text-mute">
            Why credits instead of an account balance? An account would have to remember who paid. A credit forgets: once it is in the tree, it
            looks like every other credit of the same size, and the only thing that can spend it is the pair of numbers sitting in your browser.
          </p>
        </div>
        <ol className="border-t border-line">
          {FLOW.map((s) => (
            <li key={s.n} className="grid grid-cols-[48px_1fr] gap-4 border-b border-line py-6 md:grid-cols-[64px_160px_1fr]">
              <span className="font-mono text-[12px] text-faint">{s.n}</span>
              <h3 className="text-[18px] font-medium tracking-tight">{s.t}</h3>
              <p className="col-start-2 text-[15px] leading-relaxed text-ink-2 md:col-start-3">{s.d}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Exposure ledger: one table, two states per row. */}
      <section className="wrap mt-32">
        <div className="grid gap-6 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <h2 className="title max-w-[22ch]">Where the privacy starts, and where it stops.</h2>
            <p className="mt-4 max-w-2xl text-[15px] text-mute">
              A privacy promise is only as good as the system that keeps it. This is the honest split at launch.{" "}
              <Link href="/whitepaper#exposure" className="link text-ink">
                The whitepaper goes deeper
              </Link>
              .
            </p>
          </div>
        </div>
        <div className="mt-10 grid gap-3 lg:grid-cols-2">
          <div className="tile-night p-6 md:p-8">
            <p className="flex items-center gap-2 text-[13px] text-white/60">
              <EyeOff size={15} /> Hidden by the proof
            </p>
            <ul className="mt-5 space-y-5">
              {HIDDEN.map((h) => (
                <li key={h.t}>
                  <h3 className="text-[16px] font-medium">{h.t}</h3>
                  <p className="mt-1 text-[14px] leading-relaxed text-white/60">{h.d}</p>
                </li>
              ))}
            </ul>
          </div>
          <div className="tile p-6 md:p-8">
            <p className="flex items-center gap-2 text-[13px] text-mute">
              <Eye size={15} /> Still visible
            </p>
            <ul className="mt-5 grid gap-5 sm:grid-cols-2">
              {VISIBLE.map((h) => (
                <li key={h.t}>
                  <h3 className="text-[16px] font-medium">{h.t}</h3>
                  <p className="mt-1 text-[14px] leading-relaxed text-mute">{h.d}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Who it is for. */}
      <section className="wrap mt-32">
        <h2 className="title max-w-[24ch]">Six kinds of buyer, one reason to stay unseen.</h2>
        <div className="mt-10 grid border-t border-l border-line sm:grid-cols-2 lg:grid-cols-3">
          {USERS.map((u, i) => (
            <div key={u.t} className="border-r border-b border-line p-6">
              <span className="font-mono text-[11px] text-faint">{String(i + 1).padStart(2, "0")}</span>
              <h3 className="mt-3 text-[17px] font-medium tracking-tight">{u.t}</h3>
              <p className="mt-1.5 text-[14px] leading-relaxed text-mute">{u.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Stages: four columns on a rule. */}
      <section className="wrap mt-32">
        <h2 className="title max-w-[26ch]">Models and images first. A compute market after.</h2>
        <ol className="mt-12 grid gap-8 md:grid-cols-4 md:gap-6">
          {STAGES.map((s, i) => (
            <li key={s.t} className="relative border-t border-ink/70 pt-5">
              <span className={`absolute -top-[5px] left-0 size-[9px] rounded-full ${i === 0 ? "bg-ink" : "border border-ink bg-paper"}`} aria-hidden="true" />
              <span className="tag">{s.when}</span>
              <h3 className="mt-2 text-[17px] font-medium tracking-tight">{s.t}</h3>
              <p className="mt-1.5 text-[14px] leading-relaxed text-mute">{s.d}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Token. */}
      <section id="token" className="wrap mt-32">
        <div className="tile-night grid gap-10 overflow-hidden p-7 md:grid-cols-[1.05fr_1fr] md:p-12">
          <div className="min-w-0">
            <h2 className="title text-snow">
              Hold <b>{BRAND.symbol}</b>, pay less for every credit.
            </h2>
            <p className="mt-5 max-w-md text-[15px] leading-relaxed text-white/60">
              The marketplace token on {CHAIN.name}. A paying wallet that holds it gets a lower USDG quote on every face value.
            </p>
            <CaPlate className="mt-8 max-w-[30rem]" />
          </div>
          <dl className="space-y-6 md:border-l md:border-white/10 md:pl-10">
            <div>
              <dt className="text-[16px] font-medium">A holder price</dt>
              <dd className="mt-1 text-[14px] leading-relaxed text-white/60">
                Hold at least the threshold of {BRAND.symbol} in the paying wallet and the desk applies a discount. Threshold and percentage are contract
                parameters, and each buy panel prints the price you will actually be charged.
              </dd>
            </div>
            <div>
              <dt className="text-[16px] font-medium">Read once, at the purchase</dt>
              <dd className="mt-1 text-[14px] leading-relaxed text-white/60">
                The balance is read once, inside the purchase transaction that already reveals the payer. No deposit, lock-up or staking.
              </dd>
            </div>
            <div>
              <dt className="text-[16px] font-medium">No mark on the credit</dt>
              <dd className="mt-1 text-[14px] leading-relaxed text-white/60">
                Discounted and full-price credits of one face value are indistinguishable leaves. Redeemed keys carry no hint of the token.
              </dd>
            </div>
          </dl>
        </div>
      </section>

      {/* Questions. */}
      <section className="wrap mt-32 grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
        <div>
          <h2 className="title">Straight answers.</h2>
          <p className="mt-4 max-w-sm text-[15px] text-mute">
            The questions people ask before their first credit. The <Link href="/docs#faq" className="link text-ink">docs</Link> go further.
          </p>
        </div>
        <div className="border-t border-line">
          {HOME_FAQ.map((f) => (
            <details key={f.q} className="group border-b border-line py-5">
              <summary className="flex cursor-pointer list-none items-start justify-between gap-6 text-[17px] font-medium tracking-tight">
                {f.q}
                <span className="mt-1 font-mono text-[13px] text-faint group-open:rotate-45" aria-hidden="true">
                  +
                </span>
              </summary>
              <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink-2">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Closing band. */}
      <section className="wrap mt-24">
        <div className="tile flex flex-col items-start justify-between gap-6 bg-mist px-7 py-10 md:flex-row md:items-center md:px-12">
          <h2 className="title max-w-[18ch]">One dollar is enough to start.</h2>
          <Link href="/market" className="btn">
            Pick a model <ArrowRight size={15} />
          </Link>
        </div>
      </section>
    </>
  );
}
