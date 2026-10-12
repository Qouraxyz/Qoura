"use client";

import { useChain } from "@/components/providers/ChainProvider";
import { CREDIT_DESK } from "@/config/contracts";
import { FACES } from "@/config/catalog";
import { explorerAddress } from "@/config/brand";

/** Live state of the credit tree: size, crowd per face value, and the current root. */
export function TreeNow() {
  const { facts } = useChain();
  const desk = facts?.desk;
  if (!desk) return <p className="text-[14px] text-mute">Reading the desk…</p>;
  if (!desk.live) {
    return (
      <div className="tile not-prose p-5 text-[14px] text-ink-2" data-testid="tree-now">
        The credit desk contract is not deployed yet, so the tree is empty. Its address, root and crowd sizes appear here the moment it is.
      </div>
    );
  }
  return (
    <div className="tile p-5" data-testid="tree-now">
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div>
          <dt className="text-[12px] text-mute">Credits sold</dt>
          <dd className="font-mono text-[20px]">{desk.credits ?? "–"}</dd>
        </div>
        {FACES.map((f) => (
          <div key={f}>
            <dt className="text-[12px] text-mute">${f} crowd</dt>
            <dd className="font-mono text-[20px]">{desk.crowds[String(f)] ?? 0}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-[12px] text-mute">Current root</p>
      <p className="font-mono text-[12px] break-all">{desk.root ?? "–"}</p>
      <a href={explorerAddress(CREDIT_DESK.address)} target="_blank" rel="noreferrer" className="link mt-3 inline-block text-[13px]">
        The desk contract on the explorer
      </a>
    </div>
  );
}
