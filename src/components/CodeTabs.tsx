"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { useClipboard } from "@/components/CopyCa";

/** Dark code panel with language tabs along its top edge and one copy button. */
export function CodeTabs({ tabs }: { tabs: { label: string; code: string }[] }) {
  const [at, setAt] = useState(0);
  const { copied, copy } = useClipboard();
  const tab = tabs[at];
  return (
    <div className="min-w-0 overflow-hidden rounded-[16px] bg-night">
      <div className="flex items-center justify-between gap-2 border-b border-white/10 px-2 pt-2">
        <div role="tablist" className="flex gap-1">
          {tabs.map((t, i) => (
            <button
              key={t.label}
              type="button"
              role="tab"
              aria-selected={i === at}
              onClick={() => setAt(i)}
              className={`rounded-t-lg px-3 py-2 font-mono text-[12px] transition-colors ${i === at ? "bg-white/10 text-white" : "text-white/50 hover:text-white/80"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => copy(tab.code, tab.label)} className="mr-1 mb-1 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] text-white/60 hover:text-white">
          {copied === tab.label ? <Check size={13} /> : <Copy size={13} />} {copied === tab.label ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto px-5 py-4 font-mono text-[12.5px] leading-[1.7] whitespace-pre text-[#e6e8eb]">{tab.code}</pre>
    </div>
  );
}
