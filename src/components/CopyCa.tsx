"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { BRAND, CHAIN, TOKEN, explorerAddress, shortAddress } from "@/config/brand";

const REVERT_MS = 1800;

/** Clipboard write with a fallback for embedded views; `copied` holds the id of what was just copied. */
export function useClipboard() {
  const [copied, setCopied] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const copy = useCallback(async (text: string, id: string = text) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      document.body.removeChild(area);
    }
    setCopied(id);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(null), REVERT_MS);
  }, []);
  return { copied, copy };
}

/**
 * Navbar: a slim mono strip "$TICKER | 0x12…abcd" (just "CA" below 1024px) with a round copy button at its end.
 * Before launch it reads "$TICKER | at launch" and does nothing.
 */
export function CaStrip({ className = "" }: { className?: string }) {
  const { copied, copy } = useClipboard();
  const live = TOKEN.isLive;
  const done = copied === "ca";
  return (
    <button
      type="button"
      disabled={!live}
      onClick={() => live && copy(BRAND.ca, "ca")}
      title={live ? `Copy the ${BRAND.symbol} contract address` : `${BRAND.symbol} contract address is published at launch`}
      aria-label={live ? `Copy ${BRAND.symbol} contract address ${BRAND.ca}` : `${BRAND.symbol} contract address: at launch`}
      className={`group inline-flex h-[34px] items-center rounded-full border border-line bg-card pl-3 pr-1 font-mono text-[11.5px] text-ink-2 transition-colors enabled:hover:border-ink/40 disabled:cursor-default ${className}`}
      data-testid="nav-ca"
    >
      <span className="tracking-[0.08em] text-faint">
        <span className="hidden lg:inline">{BRAND.symbol}</span>
        <span className="lg:hidden">CA</span>
      </span>
      <span className="mx-2 hidden h-3.5 w-px bg-line lg:block" aria-hidden="true" />
      <span className="hidden whitespace-nowrap lg:inline" data-testid="nav-ca-text">{live ? shortAddress(BRAND.ca, 5, 4) : "at launch"}</span>
      <span className={`ml-2 grid size-[26px] place-items-center rounded-full ${live ? "bg-ink text-snow" : "bg-mist text-pale"}`} aria-hidden="true">
        {done ? <Check size={13} strokeWidth={3} /> : <Copy size={12} />}
      </span>
      <span className="sr-only" aria-live="polite">{done ? "Copied" : ""}</span>
    </button>
  );
}

/**
 * Full address on a dark ground, for the token section and the footer.
 * The address wraps at any character so it never runs out of its box.
 */
export function CaPlate({ tone = "night", className = "" }: { tone?: "night" | "day"; className?: string }) {
  const { copied, copy } = useClipboard();
  const live = TOKEN.isLive;
  const done = copied === "ca-plate";
  const night = tone === "night";
  return (
    <div className={className} data-testid="ca-plate">
      <div
        className={`flex items-center gap-3 rounded-full border py-1.5 pr-1.5 pl-4 ${night ? "border-white/15 bg-white/[0.06]" : "border-line bg-card"}`}
      >
        <span className={`font-mono text-[10.5px] tracking-[0.18em] ${night ? "text-white/45" : "text-faint"}`}>CA</span>
        <span
          className={`min-w-0 flex-1 font-mono text-[12.5px] break-all ${night ? "text-white/90" : "text-ink"} ${live ? "" : night ? "text-white/55" : "text-mute"}`}
          data-testid="ca-plate-text"
        >
          {live ? BRAND.ca : "Contract address coming soon"}
        </span>
        <button
          type="button"
          disabled={!live}
          onClick={() => copy(BRAND.ca, "ca-plate")}
          aria-label={done ? "Copied" : "Copy contract address"}
          className={`grid size-8 shrink-0 place-items-center rounded-full transition-colors disabled:opacity-40 ${night ? "bg-white text-ink hover:bg-white/85" : "bg-ink text-snow hover:bg-ink-2"}`}
          data-testid="ca-plate-copy"
        >
          {done ? <Check size={14} strokeWidth={3} /> : <Copy size={13} />}
        </button>
      </div>
      <p className={`mt-2.5 pl-4 text-[12px] ${night ? "text-white/50" : "text-mute"}`}>
        {live ? (
          <>
            On {CHAIN.name}.{" "}
            <a href={TOKEN.explorerUrl ?? "#"} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline underline-offset-4">
              Explorer <ExternalLink size={11} />
            </a>
          </>
        ) : (
          <>Published here and on X at launch, on {CHAIN.name}. Trust no other source.</>
        )}
      </p>
    </div>
  );
}

/** Inline address with its own copy control (contract lists, small facts). */
export function AddrChip({ address, href, head = 6, tail = 4 }: { address: string; href?: string; head?: number; tail?: number }) {
  const { copied, copy } = useClipboard();
  const done = copied === address;
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[12.5px]">
      <a className="link" href={href ?? explorerAddress(address)} target="_blank" rel="noreferrer" title={address}>
        {shortAddress(address, head, tail)}
      </a>
      <button type="button" onClick={() => copy(address)} aria-label={done ? "Copied" : `Copy ${address}`} className="text-mute hover:text-ink">
        {done ? <Check size={13} strokeWidth={3} /> : <Copy size={12} />}
      </button>
    </span>
  );
}
