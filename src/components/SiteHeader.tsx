"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { Wordmark } from "@/components/Mark";
import { CaStrip } from "@/components/CopyCa";
import { XGlyph } from "@/components/icons";
import { NavWallet } from "@/components/wallet/WalletButton";
import { BRAND } from "@/config/brand";
import { NAV } from "@/components/site";

export function SiteHeader() {
  const path = usePathname();
  // The menu belongs to the page it was opened on, so navigating closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === path;
  const setOpen = (fn: (v: boolean) => boolean) => setOpenOn(fn(open) ? path : null);
  const active = (href: string) => path === href || path.startsWith(`${href}/`);

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-paper/80 backdrop-blur-md">
      <div className="wrap flex h-[64px] items-center gap-4" data-testid="navrow">
        <Link href="/" aria-label={`${BRAND.name} home`} className="shrink-0">
          <Wordmark />
        </Link>

        <nav aria-label="Main" className="ml-6 hidden items-center gap-1 lg:flex">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`rounded-full px-3 py-1.5 text-[13.5px] transition-colors ${active(n.href) ? "bg-ink text-snow" : "text-ink-2 hover:bg-mist"}`}
              aria-current={active(n.href) ? "page" : undefined}
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex min-w-0 items-center gap-2">
          <a href={BRAND.x} target="_blank" rel="noreferrer" aria-label={`${BRAND.name} on X`} className="hidden size-[34px] place-items-center rounded-full text-ink-2 hover:bg-mist sm:grid">
            <XGlyph size={14} />
          </a>
          <CaStrip />
          <NavWallet />
          <button
            type="button"
            className="grid size-[34px] place-items-center rounded-full border border-line bg-card lg:hidden"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            data-testid="nav-menu"
          >
            {open ? <X size={16} /> : <Menu size={16} />}
          </button>
        </div>
      </div>

      {open ? (
        <nav aria-label="Mobile" className="border-t border-line bg-paper lg:hidden">
          <div className="wrap grid gap-1 py-3">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className={`rounded-xl px-3 py-2.5 text-[15px] ${active(n.href) ? "bg-mist font-medium" : ""}`}>
                {n.label}
              </Link>
            ))}
            <Link href="/account" className="rounded-xl px-3 py-2.5 text-[15px]">
              Dashboard
            </Link>
            <a href={BRAND.x} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-[15px]">
              <XGlyph size={13} /> {BRAND.xHandle}
            </a>
          </div>
        </nav>
      ) : null}
    </header>
  );
}
