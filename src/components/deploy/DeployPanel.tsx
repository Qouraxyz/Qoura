"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Note } from "@/components/ui";
import { ConnectEmpty } from "@/components/wallet/WalletButton";
import { useWallet } from "@/components/wallet/WalletProvider";
import { CHAIN, USDG, explorerAddress } from "@/config/brand";
import { storageKey } from "@/config/storage";
import { explain, waitReceipt } from "@/lib/client";
import { DEPLOY_ORDER, deployData, type ContractName } from "@/lib/credit/deploy";

type Done = Partial<Record<ContractName, { address: string; block: number }>>;
const KEY = storageKey("deploy", String(CHAIN.id));
const isAddr = (a: string) => /^0x[0-9a-fA-F]{40}$/.test(a);

const ROLE: Record<ContractName, string> = {
  QouraTwinHash: "Poseidon hash library used by the desk's tree.",
  QouraChallengeTape: "Verifier helper library.",
  QouraConstraintSet: "Verifier helper library.",
  QouraRedeemCheck: "The redeem proof verifier (generated from the circuit).",
  QouraCreditDesk: "Sells credits for USDG and keeps the credit tree.",
};

export function DeployPanel() {
  const { address, onRobinhoodChain, sendTransaction } = useWallet();
  const [done, setDone] = useState<Done>(() => {
    if (typeof window === "undefined") return {};
    try {
      return JSON.parse(window.localStorage.getItem(KEY) ?? "{}") as Done;
    } catch {
      return {};
    }
  });
  const [treasury, setTreasury] = useState("");
  const [ownerInput, setOwner] = useState<string | null>(null);
  const owner = ownerInput ?? address ?? "";
  const [busy, setBusy] = useState<ContractName | null>(null);
  const [error, setError] = useState<string | null>(null);


  const save = (next: Done) => {
    setDone(next);
    window.localStorage.setItem(KEY, JSON.stringify(next));
  };

  async function step(name: ContractName) {
    setError(null);
    setBusy(name);
    try {
      const libraries = Object.fromEntries(Object.entries(done).map(([k, v]) => [k, v!.address])) as Partial<Record<ContractName, string>>;
      const data = deployData(name, { libraries, usdg: USDG.address, treasury, owner });
      const hash = await sendTransaction({ data });
      const r = await waitReceipt(hash, 300_000);
      if (!r.contractAddress) throw new Error("The receipt has no contract address.");
      save({ ...done, [name]: { address: r.contractAddress, block: Number(BigInt(r.blockNumber)) } });
    } catch (e) {
      setError(explain(e, "The deployment failed."));
    } finally {
      setBusy(null);
    }
  }

  if (!address) return <ConnectEmpty>Connect the wallet that pays for deployment (about 12.5 million gas in total).</ConnectEmpty>;
  const desk = done.QouraCreditDesk;

  return (
    <div className="space-y-6">
      {!onRobinhoodChain ? <Note tone="warn">Switch the wallet to {CHAIN.name} first.</Note> : null}
      <div className="tile grid gap-4 p-5">
        <label className="text-[12.5px] text-mute">
          Treasury (receives every USDG payment; a Safe is recommended)
          <input className="field mt-1 font-mono text-[12.5px]" value={treasury} onChange={(e) => setTreasury(e.target.value.trim())} placeholder="0x…" />
        </label>
        <label className="text-[12.5px] text-mute">
          Owner (can pause buying, set holder terms, set the token once)
          <input className="field mt-1 font-mono text-[12.5px]" value={owner} onChange={(e) => setOwner(e.target.value.trim())} placeholder="0x…" />
        </label>
      </div>
      <ol className="divide-y divide-line border-y border-line">
        {DEPLOY_ORDER.map((name, i) => {
          const d = done[name];
          const ready = DEPLOY_ORDER.slice(0, i).every((n) => done[n]) && (name !== "QouraCreditDesk" || (isAddr(treasury) && isAddr(owner)));
          return (
            <li key={name} className="flex flex-wrap items-center gap-4 py-4">
              <span className="font-mono text-[12px] text-faint">0{i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-medium">{name}</span>
                <span className="block text-[12.5px] text-mute">{ROLE[name]}</span>
                {d ? (
                  <a href={explorerAddress(d.address)} target="_blank" rel="noreferrer" className="link font-mono text-[12px]">
                    {d.address} · block {d.block}
                  </a>
                ) : null}
              </span>
              {d ? (
                <span className="pill">
                  <Check size={12} /> Deployed
                </span>
              ) : (
                <button type="button" className="btn btn-sm" disabled={!ready || busy !== null} onClick={() => step(name)}>
                  {busy === name ? "Confirm in wallet…" : "Deploy"}
                </button>
              )}
            </li>
          );
        })}
      </ol>
      {error ? <Note tone="bad">{error}</Note> : null}
      {desk ? (
        <div className="tile p-5 text-[14px]">
          <p className="font-medium">Done. Put these two lines in src/config/contracts.ts and push:</p>
          <pre className="code mt-3">{`const DESK = "${desk.address}";\nconst DESK_BLOCK = ${desk.block};`}</pre>
          <p className="mt-3 text-mute">Then run npm run verify-deployment and the explorer verification. Holder terms stay at zero until the token exists.</p>
        </div>
      ) : null}
      <button
        type="button"
        className="text-[12.5px] text-mute underline"
        onClick={() => {
          if (window.confirm("Forget the addresses recorded in this browser?")) save({});
        }}
      >
        Start over
      </button>
    </div>
  );
}
