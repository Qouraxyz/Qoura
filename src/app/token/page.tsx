import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { CaPlate } from "@/components/CopyCa";
import { BRAND, CHAIN, TOKEN } from "@/config/brand";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  path: "/token",
  title: `${BRAND.name} (${BRAND.symbol}) Token`,
  description: `${BRAND.symbol} is the ${BRAND.name} marketplace token on ${CHAIN.name}. Holding it in the wallet that pays lowers the USDG price of every credit, with nothing locked.`,
});

export default function TokenPage() {
  return (
    <div className="wrap pt-14 md:pt-20">
      <div className="grid gap-10 md:grid-cols-[1.1fr_1fr] md:items-center">
        <div>
          <p className="tag">{CHAIN.name}</p>
          <h1 className="display mt-4">
            {BRAND.name} <b>({BRAND.symbol})</b> token
          </h1>
          <p className="lede mt-5 max-w-xl">
            The marketplace token. Pay from a wallet that holds it and every credit is quoted for less USDG. Nothing is staked, locked or
            delegated.
          </p>
        </div>
        <div className="relative aspect-[3/1] overflow-hidden rounded-[18px] border border-line bg-[#ececec]">
          <Image src="/brand/banner.webp" alt={`${BRAND.name} logo: a pixel Q with a magnifier handle beside the name`} fill priority sizes="(min-width: 768px) 45vw, 100vw" className="object-contain" />
        </div>
      </div>

      <section className="tile-night mt-14 p-7 md:p-10">
        <h2 className="text-[22px] font-light">Contract address</h2>
        <CaPlate className="mt-5 max-w-2xl" />
        {!TOKEN.isLive ? <p className="mt-4 text-[13px] text-white/50">Contract address coming soon. Until it appears here, any address you are shown is not {BRAND.symbol}.</p> : null}
      </section>

      <section className="mt-16 grid gap-10 md:grid-cols-3">
        <div>
          <h2 className="text-[19px] font-medium">What holding does</h2>
          <p className="mt-2 text-[14.5px] leading-relaxed text-mute">
            When the paying wallet holds at least the threshold, the credit desk quotes a lower USDG price for the same face value. The threshold and
            the discount are parameters of the desk contract, capped at 30 percent, and every buy panel shows the price you will pay.
          </p>
        </div>
        <div>
          <h2 className="text-[19px] font-medium">When it is checked</h2>
          <p className="mt-2 text-[14.5px] leading-relaxed text-mute">
            Once, inside the purchase transaction, by reading the payer&apos;s balance. The payer is public at that moment anyway, so holding adds no
            new link.
          </p>
        </div>
        <div>
          <h2 className="text-[19px] font-medium">What it does not change</h2>
          <p className="mt-2 text-[14.5px] leading-relaxed text-mute">
            A discounted credit enters the same tree as any other of its face value. The redeem proof and the key carry no trace of the token.
          </p>
        </div>
      </section>

      <section className="mt-16 max-w-3xl">
        <h2 className="title text-[30px]">How to get {BRAND.symbol}</h2>
        <ol className="mt-5 list-decimal space-y-2 pl-5 text-[15px] text-ink-2">
          <li>Use a wallet that can reach {CHAIN.name}; connecting here adds the network for you.</li>
          <li>Copy the contract address from this page only, and check it against the one on {BRAND.xHandle}.</li>
          <li>Trade it where it is listed at launch. This page links the explorer as soon as the address is live.</li>
        </ol>
        <p className="mt-6 text-[14px] text-mute">
          Want the discount only? Buy credits as usual from the <Link href="/market" className="link">marketplace</Link>; the price is lowered
          automatically for holders.
        </p>
      </section>
    </div>
  );
}
