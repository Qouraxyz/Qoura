import Image from "next/image";
import Link from "next/link";
import { Mark } from "@/components/Mark";
import { MakerLogo } from "@/components/MakerLogo";
import type { Item } from "@/config/catalog";
import type { Price } from "@/lib/server/catalog";
import { contextLabel, usd } from "@/lib/format";

export type CardItem = Item & { price: Price; context?: number };

export function ItemGlyph({ item, size }: { item: Pick<Item, "maker">; size: number }) {
  return item.maker === "house" ? <Mark size={size} /> : <MakerLogo maker={item.maker} size={size} />;
}

/** The price a card leads with: output per 1M tokens for models, per call otherwise. */
export function headline(item: CardItem) {
  if (item.category === "models") return { value: usd(item.price.out ?? 0), unit: "per 1M out" };
  return { value: usd(item.price.call ?? 0, 3), unit: item.category === "media" ? "per image, about" : "per answer, about" };
}

export function ItemCard({ item }: { item: CardItem }) {
  const h = headline(item);
  const planned = item.status === "planned";
  return (
    <Link href={`/market/${item.slug}`} className="group block min-w-0" data-testid="item-card">
      <div className="relative aspect-square overflow-hidden rounded-[16px] border border-line bg-mist">
        <Image src="/art/card.webp" alt="" fill sizes="(min-width: 1024px) 22vw, (min-width: 640px) 33vw, 50vw" className="object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
        <div className="absolute inset-0 grid place-items-center text-ink">
          <ItemGlyph item={item} size={56} />
        </div>
        {planned ? <span className="pill absolute top-3 left-3">Planned</span> : null}
      </div>
      <h3 className="mt-3 text-[15px] leading-snug font-medium tracking-tight">{item.name}</h3>
      <p className="text-[12.5px] text-mute">
        {item.makerName} · {item.shelf}
      </p>
      <p className="mt-1.5 flex flex-wrap items-baseline gap-x-1.5">
        <span className="font-mono text-[14px]">{h.value}</span>
        <span className="text-[11.5px] text-mute">{h.unit}</span>
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {item.context ? <span className="pill h-[22px] text-[11px]">{contextLabel(item.context)} context</span> : null}
        <span className="pill h-[22px] text-[11px]">{planned ? "Coming later" : "From one dollar"}</span>
      </div>
    </Link>
  );
}
