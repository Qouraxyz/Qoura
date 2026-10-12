import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { CoverageBuy } from "@/components/market/CoverageBuy";
import { ItemCard, ItemGlyph } from "@/components/market/ItemCard";
import { BRAND, CHAIN } from "@/config/brand";
import { CATEGORIES, ITEMS } from "@/config/catalog";
import { pricedItem, pricedItems } from "@/lib/server/catalog";
import { contextLabel, usd } from "@/lib/format";
import { breadcrumbLd, pageMeta } from "@/lib/seo";

export const revalidate = 1800;

export function generateStaticParams() {
  return ITEMS.map((i) => ({ slug: i.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const item = ITEMS.find((i) => i.slug === slug);
  if (!item) return {};
  return pageMeta({
    path: `/market/${slug}`,
    title: `${item.name} | ${BRAND.name}`,
    description: `${item.name} by ${item.makerName} on ${BRAND.name}: price, details and how to buy a credit for it in USDG on ${CHAIN.name}, then use it with a private API key.`,
  });
}

export default async function ItemPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const item = await pricedItem(slug);
  if (!item) notFound();
  const cat = CATEGORIES.find((c) => c.key === item.category)!;
  const more = (await pricedItems()).filter((i) => i.category === item.category && i.slug !== item.slug && i.status !== "planned").slice(0, 4);
  const planned = item.status === "planned";
  const endpoint = item.category === "media" ? "images/generations" : "chat/completions";
  const sample =
    item.category === "media"
      ? `curl ${BRAND.url}/v1/images/generations \\
  -H "Authorization: Bearer qk-..." \\
  -H "Content-Type: application/json" \\
  -d '{"model": "${item.slug}", "aspect_ratio": "4:3",
       "prompt": "A frosted glass slab on a still lake"}'`
      : `curl ${BRAND.url}/v1/chat/completions \\
  -H "Authorization: Bearer qk-..." \\
  -H "Content-Type: application/json" \\
  -d '{"model": "${item.slug}", "max_tokens": 400,
       "messages": [{"role": "user", "content": "Summarise this changelog"}]}'`;

  const facts: [string, string][] = [
    ["Id for API calls", item.slug],
    ["Maker", item.makerName],
    ["Reads", item.input],
    ...(item.context ? ([["Context", `${contextLabel(item.context)} tokens`]] as [string, string][]) : []),
    ["Endpoint", planned ? "Not on sale yet" : `/v1/${endpoint}`],
    ["Billing", item.category === "models" ? "Metered per token against the key" : "Metered per request that returns a result"],
    ["Served by", "A third-party model supplier, through the gateway"],
  ];

  return (
    <div className="wrap pt-8">
      <JsonLd data={breadcrumbLd([{ name: "Marketplace", path: "/market" }, { name: item.name, path: `/market/${item.slug}` }])} />
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-[12.5px] text-mute">
        <Link href="/market" className="hover:text-ink">
          Marketplace
        </Link>
        <ChevronRight size={12} />
        <Link href={`/market?category=${item.category}`} className="hover:text-ink">
          {cat.label}
        </Link>
        <ChevronRight size={12} />
        <span className="text-ink">{item.name}</span>
      </nav>

      <header className="mt-8 grid gap-6 border-b border-line pb-10 md:grid-cols-[auto_1fr] md:items-end">
        <div className="relative size-28 overflow-hidden rounded-[18px] border border-line md:size-36">
          <Image src="/art/card.webp" alt="" fill sizes="144px" className="object-cover" />
          <span className="absolute inset-0 grid place-items-center">
            <ItemGlyph item={item} size={44} />
          </span>
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap gap-1.5">
            <span className="pill">{cat.label}</span>
            <span className="pill">{item.shelf}</span>
            {planned ? <span className="pill border-dashed">Planned</span> : null}
          </div>
          <h1 className="display mt-3">{item.name}</h1>
          <p className="mt-2 text-[15px] text-mute">by {item.makerName}</p>
        </div>
      </header>

      <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_400px] lg:gap-14">
        <div className="min-w-0">
          <p className="lede max-w-2xl">{item.blurb}</p>
          <div className="mt-8 grid max-w-xl grid-cols-2 gap-6 border-y border-line py-5">
            {item.category === "models" ? (
              <>
                <div>
                  <span className="text-[12px] text-mute">Input</span>
                  <p className="font-mono text-[22px]">
                    {usd(item.price.in)} <span className="font-sans text-[12px] text-mute">per 1M tokens</span>
                  </p>
                </div>
                <div>
                  <span className="text-[12px] text-mute">Output</span>
                  <p className="font-mono text-[22px]">
                    {usd(item.price.out)} <span className="font-sans text-[12px] text-mute">per 1M tokens</span>
                  </p>
                </div>
              </>
            ) : (
              <div className="col-span-2">
                <span className="text-[12px] text-mute">{item.category === "media" ? "Per image, about" : "Per answer, about"}</span>
                <p className="font-mono text-[22px]">{usd(item.price.call, 3)}</p>
              </div>
            )}
          </div>
          {!item.price.live ? <p className="mt-2 text-[12px] text-faint">Last known supplier price; the live rate could not be read just now.</p> : null}

          <section className="mt-12">
            <h2 className="text-[20px] font-medium tracking-tight">Specs</h2>
            <dl className="mt-4 border-t border-line">
              {facts.map(([k, v]) => (
                <div key={k} className="grid grid-cols-[140px_1fr] gap-4 border-b border-line py-3 text-[14px] sm:grid-cols-[180px_1fr]">
                  <dt className="text-mute">{k}</dt>
                  <dd className="min-w-0 break-words">{v}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="mt-12">
            <h2 className="text-[20px] font-medium tracking-tight">Once you hold a credit</h2>
            <ol className="mt-4 space-y-4">
              <li className="grid grid-cols-[28px_1fr] gap-3">
                <span className="grid size-6 place-items-center rounded-md border border-line font-mono text-[11px]">1</span>
                <div>
                  <h3 className="text-[15px] font-medium">Redeem it in the dashboard</h3>
                  <p className="text-[14px] text-mute">A local proof covers the whole face-value set, and the balance lands on a key generated in your browser.</p>
                </div>
              </li>
              <li className="grid grid-cols-[28px_1fr] gap-3">
                <span className="grid size-6 place-items-center rounded-md border border-line font-mono text-[11px]">2</span>
                <div>
                  <h3 className="text-[15px] font-medium">Call {item.name}</h3>
                  <p className="text-[14px] text-mute">Any OpenAI client works with the base URL {BRAND.url}/v1 and your key.</p>
                </div>
              </li>
            </ol>
            <pre className="code mt-5">{sample}</pre>
            <Link href="/whitepaper#exposure" className="link mt-3 inline-block text-[13px]">
              Read the privacy limits
            </Link>
          </section>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          {planned ? (
            <div className="tile p-6">
              <h2 className="text-[19px] font-medium">Not on sale yet</h2>
              <p className="mt-2 text-[14px] text-mute">This item is on the roadmap. Credits bought today will spend on it once it opens.</p>
              <Link href="/market" className="btn mt-5 w-full">
                Back to the shelf
              </Link>
            </div>
          ) : (
            <CoverageBuy name={item.name} category={item.category} out={item.price.out ?? 0} call={item.price.call ?? 0} />
          )}
        </aside>
      </div>

      {more.length ? (
        <section className="mt-24">
          <h2 className="title text-[28px]">More {cat.label.toLowerCase()}</h2>
          <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-4">
            {more.map((m) => (
              <ItemCard key={m.slug} item={m} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
