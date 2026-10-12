"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { CATEGORIES, SHELVES, type CategoryKey } from "@/config/catalog";
import { ItemCard, type CardItem } from "@/components/market/ItemCard";

type Sort = "featured" | "low" | "high" | "name";
const SORTS: { key: Sort; label: string }[] = [
  { key: "featured", label: "Featured" },
  { key: "low", label: "Cheapest first" },
  { key: "high", label: "Priciest first" },
  { key: "name", label: "A to Z" },
];

const price = (i: CardItem) => (i.category === "models" ? (i.price.out ?? 0) : (i.price.call ?? 0));

export function MarketBoard({ items, live }: { items: CardItem[]; live: boolean }) {
  const params = useSearchParams();
  const router = useRouter();
  const raw = params.get("category");
  const category: CategoryKey = CATEGORIES.some((c) => c.key === raw) ? (raw as CategoryKey) : "models";
  const [shelf, setShelf] = useState<string>("All");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("featured");

  const pick = (c: CategoryKey) => {
    setShelf("All");
    router.replace(`/market?category=${c}`, { scroll: false });
  };

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = items.filter(
      (i) =>
        i.category === category &&
        (shelf === "All" || i.shelf === shelf) &&
        (!needle || `${i.name} ${i.makerName} ${i.shelf}`.toLowerCase().includes(needle)),
    );
    if (sort === "low") list.sort((a, b) => price(a) - price(b));
    if (sort === "high") list.sort((a, b) => price(b) - price(a));
    if (sort === "name") list.sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [items, category, shelf, q, sort]);

  const cat = CATEGORIES.find((c) => c.key === category)!;

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[240px_1fr] lg:gap-12">
      <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start">
        <nav aria-label="Categories" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-col lg:gap-1 lg:overflow-visible lg:px-0">
          {CATEGORIES.map((c) => {
            const on = c.key === category;
            const n = items.filter((i) => i.category === c.key && i.status !== "planned").length;
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => pick(c.key)}
                aria-pressed={on}
                className={`flex shrink-0 items-center justify-between gap-6 rounded-xl border px-3.5 py-2.5 text-left transition-colors lg:w-full ${on ? "border-ink bg-ink text-snow" : "border-line bg-card hover:bg-white"}`}
                data-testid={`cat-${c.key}`}
              >
                <span>
                  <span className={`block font-mono text-[10px] tracking-[0.16em] uppercase ${on ? "text-white/55" : "text-faint"}`}>{c.verb}</span>
                  <span className="block text-[14px] font-medium">{c.label}</span>
                </span>
                <span className={`text-[11.5px] ${on ? "text-white/60" : "text-mute"}`}>{c.live ? n : "Soon"}</span>
              </button>
            );
          })}
        </nav>
        <p className="mt-5 hidden text-[13px] leading-relaxed text-mute lg:block">{cat.blurb}</p>
        <p className="mt-4 hidden text-[12px] leading-relaxed text-faint lg:block">
          {live ? "Prices follow the supplier's live rates." : "Supplier rates could not be read just now; last known prices shown."}
        </p>
      </aside>

      <div className="min-w-0">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="relative block min-w-0 flex-1">
            <span className="sr-only">Search the shelf</span>
            <Search size={15} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-mute" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${cat.label.toLowerCase()}`} className="field pl-10" data-testid="market-search" />
          </label>
          <label className="flex shrink-0 items-center gap-2 text-[13px] text-mute">
            Sort
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="field h-11 w-auto pr-8">
              {SORTS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {category === "models" ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {["All", ...SHELVES].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setShelf(s)}
                aria-pressed={shelf === s}
                className={`h-8 rounded-full border px-3.5 text-[12.5px] transition-colors ${shelf === s ? "border-ink bg-ink text-snow" : "border-line bg-card hover:bg-white"}`}
              >
                {s}
              </button>
            ))}
          </div>
        ) : null}

        <p className="mt-5 text-[12.5px] text-mute" aria-live="polite">
          {shown.length} {shown.length === 1 ? "item" : "items"}
        </p>

        {category === "compute" ? (
          <div className="tile mt-4 p-8">
            <h2 className="text-[20px] font-light">Compute is not on sale yet.</h2>
            <p className="mt-2 max-w-lg text-[14px] text-mute">
              Sandboxes billed by the second come after the agent kit, then GPU jobs. Credits you buy today will spend on them too.
            </p>
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3">
            {shown.map((i) => (
              <ItemCard key={i.slug} item={i} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
