"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, Copy, ExternalLink, KeyRound, Plus, Trash2 } from "lucide-react";
import { useClipboard } from "@/components/CopyCa";
import { Note } from "@/components/ui";
import { ConnectEmpty } from "@/components/wallet/WalletButton";
import { useWallet } from "@/components/wallet/WalletProvider";
import { BRAND } from "@/config/brand";
import { ITEMS } from "@/config/catalog";
import { CREDIT_DESK, deskLive } from "@/config/contracts";
import { ethCall, txUrl } from "@/lib/client";
import { loadTree, prove, redeemBody, submitRedeem, warmProver } from "@/lib/credit/client";
import { creditLeaf, decodeCredit, keyBindingOf, newApiKey, type Credit } from "@/lib/credit/core";
import { addHistory, newId, patchCredit, upsertCredit, useVault, writeVault, type StoredCredit, type StoredKey } from "@/lib/credit/vault";

type Tab = "credits" | "keys" | "history" | "playground";
const TABS: { key: Tab; label: string }[] = [
  { key: "credits", label: "Credits" },
  { key: "keys", label: "Keys" },
  { key: "history", label: "History" },
  { key: "playground", label: "Playground" },
];

const when = (t: number) => new Date(t).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
const short = (k: string) => `${k.slice(0, 7)}…${k.slice(-4)}`;

export function Dashboard() {
  const { address, chainId, onRobinhoodChain } = useWallet();
  const vault = useVault(address);
  const [tab, setTab] = useState<Tab>("credits");

  if (!address) {
    return (
      <div className="tile p-8 md:p-10">
        <h2 className="title text-[30px]">Connect to open your dashboard.</h2>
        <div className="mt-6">
          <ConnectEmpty>
            Connecting picks which wallet&apos;s credits, keys and history this browser shows. Nothing about them is sent to {BRAND.name}.
          </ConnectEmpty>
        </div>
      </div>
    );
  }

  return (
    <div>
      {chainId !== null && !onRobinhoodChain ? (
        <Note tone="warn" className="mb-6">
          Your wallet is on another network. Redeeming and calling need no network at all; buying does.
        </Note>
      ) : null}
      <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-line">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`-mb-px shrink-0 border-b-2 px-4 py-2.5 text-[14px] transition-colors ${tab === t.key ? "border-ink font-medium text-ink" : "border-transparent text-mute hover:text-ink"}`}
            data-testid={`tab-${t.key}`}
          >
            {t.label}
            {t.key === "credits" && vault.credits.length ? <span className="ml-1.5 text-[12px] text-faint">{vault.credits.length}</span> : null}
            {t.key === "keys" && vault.keys.length ? <span className="ml-1.5 text-[12px] text-faint">{vault.keys.length}</span> : null}
          </button>
        ))}
      </div>
      <div className="pt-8">
        {tab === "credits" ? <Credits owner={address} credits={vault.credits} keys={vault.keys} /> : null}
        {tab === "keys" ? <Keys owner={address} keys={vault.keys} /> : null}
        {tab === "history" ? <History entries={vault.history} /> : null}
        {tab === "playground" ? <Playground keys={vault.keys} /> : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ credits + redeem */

function Credits({ owner, credits, keys }: { owner: string; credits: StoredCredit[]; keys: StoredKey[] }) {
  const { copied, copy } = useClipboard();
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const open = credits.filter((c) => c.status === "bought");

  useEffect(() => {
    if (open.length) warmProver();
  }, [open.length]);

  function importBackup() {
    setImportError(null);
    try {
      const credit = decodeCredit(importText);
      const backup = importText.trim();
      if (credits.some((c) => c.backup === backup)) throw new Error("That credit is already in this browser.");
      upsertCredit(owner, { id: newId(), face: credit.face, backup, status: "bought", practice: !deskLive(), createdAt: Date.now(), note: "Imported from a backup" });
      setImportText("");
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "That backup could not be read.");
    }
  }

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_380px]">
      <div className="min-w-0">
        {credits.length === 0 ? (
          <div className="tile p-8">
            <h2 className="text-[20px] font-light">Nothing here yet.</h2>
            <p className="mt-2 text-[14px] text-mute">Credits you buy in this browser appear here, ready to redeem into a key.</p>
            <Link href="/market" className="btn mt-5">
              Buy a credit
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-line border-y border-line">
            {credits.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-x-5 gap-y-2 py-4" data-testid="credit-row">
                <span className="font-mono text-[20px]">${c.face}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className={`pill ${c.status === "failed" ? "border-alarm/30 text-alarm" : ""}`}>{c.status}</span>
                    {c.practice ? <span className="pill border-dashed">practice</span> : null}
                  </span>
                  <span className="mt-1 block text-[12px] text-mute">
                    {when(c.createdAt)}
                    {c.note ? ` · ${c.note}` : ""}
                  </span>
                </span>
                {c.tx ? (
                  <a href={txUrl(c.tx)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12.5px] text-mute hover:text-ink">
                    Payment <ExternalLink size={11} />
                  </a>
                ) : null}
                <button type="button" onClick={() => copy(c.backup, c.id)} className="btn-line btn-sm">
                  {copied === c.id ? <Check size={13} /> : <Copy size={13} />} Backup
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-8">
          <h3 className="text-[15px] font-medium">Bring a credit from elsewhere</h3>
          <p className="mt-1 text-[13px] text-mute">Paste a backup string to redeem a credit bought in another browser or by an agent.</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input value={importText} onChange={(e) => setImportText(e.target.value)} placeholder="qoura-credit:1:…" className="field font-mono text-[12px]" />
            <button type="button" className="btn-line shrink-0" onClick={importBackup} disabled={!importText.trim()}>
              Add
            </button>
          </div>
          {importError ? <p className="mt-2 text-[12.5px] text-alarm">{importError}</p> : null}
        </div>
      </div>

      <Redeem owner={owner} open={open} keys={keys} allCredits={credits} />
    </div>
  );
}

type RedeemStage = { kind: "idle" } | { kind: "busy"; text: string } | { kind: "done"; text: string } | { kind: "error"; text: string };

function Redeem({ owner, open, keys, allCredits }: { owner: string; open: StoredCredit[]; keys: StoredKey[]; allCredits: StoredCredit[] }) {
  const [creditId, setCreditId] = useState<string>("");
  const [keyId, setKeyId] = useState<string>("new");
  const [stage, setStage] = useState<RedeemStage>({ kind: "idle" });
  const chosen = open.find((c) => c.id === creditId) ?? open[0];

  const crowd = useMemo(() => {
    if (!chosen) return null;
    // Practice credits: the crowd is this browser's practice credits of the same face value.
    return chosen.practice ? allCredits.filter((c) => c.practice && c.face === chosen.face).length : null;
  }, [chosen, allCredits]);

  async function run() {
    if (!chosen) return;
    let credit: Credit;
    try {
      credit = decodeCredit(chosen.backup);
    } catch {
      setStage({ kind: "error", text: "This credit's backup is damaged." });
      return;
    }
    let key = keys.find((k) => k.id === keyId) ?? null;
    if (!key) {
      key = { id: newId(), key: newApiKey(), label: `Key ${keys.length + 1}`, createdAt: Date.now() };
      const made = key;
      writeVault(owner, (v) => ({ ...v, keys: [made, ...v.keys] }));
      addHistory(owner, { kind: "key", text: `Made ${made.label} in this browser` });
      // A retry after a failure tops up this key instead of making another empty one.
      setKeyId(made.id);
    }
    const binding = keyBindingOf(key.key);
    try {
      let leaves: bigint[];
      if (chosen.practice) {
        // Practice: the tree is every practice credit in this browser, oldest first.
        leaves = allCredits
          .filter((c) => c.practice)
          .slice()
          .reverse()
          .map((c) => creditLeaf(decodeCredit(c.backup)));
      } else {
        setStage({ kind: "busy", text: "Downloading every credit leaf and checking the root" });
        const { tree } = await loadTree(ethCall, CREDIT_DESK.address);
        leaves = tree.leaves();
      }
      setStage({ kind: "busy", text: "Building the proof in this browser" });
      const proof = await prove(credit, leaves, binding);
      if (chosen.practice) {
        setStage({ kind: "done", text: `Proof built in ${(proof.ms / 1000).toFixed(1)} s against a practice tree of ${leaves.length}. Practice credits fund nothing, so it was not sent.` });
        addHistory(owner, { kind: "redeem", text: `Practice proof for a $${chosen.face} credit (${(proof.ms / 1000).toFixed(1)} s)` });
        return;
      }
      setStage({ kind: "busy", text: "Sending the proof to the gateway" });
      await submitRedeem(redeemBody(proof));
      patchCredit(owner, chosen.id, { status: "redeemed", redeemedAt: Date.now(), keyId: key.id });
      addHistory(owner, { kind: "redeem", text: `Redeemed a $${chosen.face} credit into ${key.label}` });
      setStage({ kind: "done", text: `$${chosen.face} added to ${key.label}. Find it under Keys.` });
    } catch (e) {
      const text = e instanceof Error ? e.message : "The redeem failed. The credit is still yours.";
      // Spent elsewhere (another browser or an agent holding the backup): it can never redeem again here.
      if (/already redeemed/i.test(text)) patchCredit(owner, chosen.id, { status: "redeemed", note: "Redeemed elsewhere" });
      setStage({ kind: "error", text });
    }
  }

  return (
    <aside className="tile h-fit p-5 lg:sticky lg:top-24" data-testid="redeem-panel">
      <h3 className="text-[19px] font-medium tracking-tight">Redeem</h3>
      <p className="mt-1 text-[13px] leading-relaxed text-mute">
        Your browser proves one of these credits is yours without saying which, and tops up a key. No wallet signature is involved.
      </p>
      {open.length === 0 ? (
        <p className="mt-5 text-[13.5px] text-ink-2">No unredeemed credits in this browser.</p>
      ) : (
        <div className="mt-5 space-y-3">
          <label className="block text-[12.5px] text-mute">
            Credit
            <select className="field mt-1" value={chosen?.id} onChange={(e) => setCreditId(e.target.value)}>
              {open.map((c) => (
                <option key={c.id} value={c.id}>
                  ${c.face} · {when(c.createdAt)}
                  {c.practice ? " · practice" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-[12.5px] text-mute">
            Into key
            <select className="field mt-1" value={keyId} onChange={(e) => setKeyId(e.target.value)}>
              <option value="new">A new key, made now in this browser</option>
              {keys.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label} · {short(k.key)}
                </option>
              ))}
            </select>
          </label>
          {crowd !== null ? <p className="text-[12px] text-mute">Practice crowd at ${chosen?.face}: {crowd}</p> : null}
          <button type="button" className="btn w-full" onClick={run} disabled={stage.kind === "busy"} data-testid="redeem-submit">
            {stage.kind === "busy" ? stage.text : "Make the proof and redeem"}
          </button>
        </div>
      )}
      {stage.kind === "done" ? (
        <Note className="mt-4">
          <span data-testid="redeem-done">{stage.text}</span>
        </Note>
      ) : null}
      {stage.kind === "error" ? (
        <Note tone="bad" className="mt-4">
          {stage.text}
        </Note>
      ) : null}
      <p className="mt-4 text-[12px] leading-relaxed text-faint">Waiting before you redeem, and redeeming from another network, makes the link harder to guess.</p>
    </aside>
  );
}

/* ------------------------------------------------------------ keys */

function KeyRow({ k, owner }: { k: StoredKey; owner: string }) {
  const { copied, copy } = useClipboard();
  const [balance, setBalance] = useState<string>("…");
  const [show, setShow] = useState(false);
  useEffect(() => {
    let stop = false;
    fetch("/v1/key", { headers: { authorization: `Bearer ${k.key}` }, cache: "no-store" })
      .then(async (r) => {
        const j = (await r.json().catch(() => null)) as { balance_usd?: number; error?: { code?: string } } | null;
        if (stop) return;
        if (r.ok && j && typeof j.balance_usd === "number") setBalance(`$${j.balance_usd.toFixed(4)}`);
        else setBalance(j?.error?.code === "not_configured" ? "gateway not configured" : "unavailable");
      })
      .catch(() => !stop && setBalance("unavailable"));
    return () => {
      stop = true;
    };
  }, [k.key]);
  return (
    <li className="grid gap-3 py-4 sm:grid-cols-[1fr_auto] sm:items-center" data-testid="key-row">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-[15px] font-medium">
          <KeyRound size={15} className="text-mute" /> {k.label}
          <span className="font-mono text-[12.5px] font-normal text-mute">{balance}</span>
        </p>
        <p className="mt-1 truncate font-mono text-[12px] text-ink-2">{show ? k.key : short(k.key)}</p>
      </div>
      <div className="flex gap-2">
        <button type="button" className="btn-line btn-sm" onClick={() => setShow((v) => !v)}>
          {show ? "Hide" : "Show"}
        </button>
        <button type="button" className="btn-line btn-sm" onClick={() => copy(k.key, k.id)}>
          {copied === k.id ? <Check size={13} /> : <Copy size={13} />} Copy
        </button>
        <button
          type="button"
          className="btn-line btn-sm text-alarm"
          aria-label={`Forget ${k.label}`}
          onClick={() => {
            if (window.confirm(`Forget ${k.label}? Copy it first: its balance cannot be recovered without it.`)) writeVault(owner, (v) => ({ ...v, keys: v.keys.filter((x) => x.id !== k.id) }));
          }}
        >
          <Trash2 size={13} />
        </button>
      </div>
    </li>
  );
}

function Keys({ owner, keys }: { owner: string; keys: StoredKey[] }) {
  return (
    <div className="max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[14px] text-mute">Keys are made in this browser. The site only ever sees their binding at redeem time, and the key itself on each call.</p>
        <button
          type="button"
          className="btn-line btn-sm"
          onClick={() => {
            const k = { id: newId(), key: newApiKey(), label: `Key ${keys.length + 1}`, createdAt: Date.now() };
            writeVault(owner, (v) => ({ ...v, keys: [k, ...v.keys] }));
            addHistory(owner, { kind: "key", text: `Made ${k.label} in this browser` });
          }}
        >
          <Plus size={13} /> New key
        </button>
      </div>
      {keys.length ? (
        <ul className="mt-5 divide-y divide-line border-y border-line">
          {keys.map((k) => (
            <KeyRow key={k.id} k={k} owner={owner} />
          ))}
        </ul>
      ) : (
        <p className="mt-6 text-[14px] text-ink-2">No keys yet. Redeeming a credit makes one for you.</p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ history */

function History({ entries }: { entries: { at: number; kind: string; text: string; tx?: string }[] }) {
  if (!entries.length) return <p className="text-[14px] text-ink-2">Purchases, redeems and keys you make here are listed in this browser.</p>;
  return (
    <ul className="max-w-3xl divide-y divide-line border-y border-line">
      {entries.map((e, i) => (
        <li key={`${e.at}-${i}`} className="grid gap-1 py-3 text-[14px] sm:grid-cols-[170px_90px_1fr]">
          <span className="font-mono text-[12px] text-mute">{when(e.at)}</span>
          <span className="tag">{e.kind}</span>
          <span className="min-w-0">
            {e.text}
            {e.tx ? (
              <a href={txUrl(e.tx)} target="_blank" rel="noreferrer" className="link ml-2 text-[12.5px]">
                tx
              </a>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------ playground */

function Playground({ keys }: { keys: StoredKey[] }) {
  const models = ITEMS.filter((i) => i.category === "models" || i.slug === "web-answer");
  const [keyId, setKeyId] = useState(keys[0]?.id ?? "");
  const [model, setModel] = useState("gpt-oss-120b");
  const [prompt, setPrompt] = useState("");
  const [out, setOut] = useState<{ text: string; charge?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const key = keys.find((k) => k.id === keyId) ?? keys[0];

  async function run() {
    if (!key || !prompt.trim()) return;
    setBusy(true);
    setError(null);
    setOut(null);
    try {
      const res = await fetch("/v1/chat/completions", {
        method: "POST",
        headers: { authorization: `Bearer ${key.key}`, "content-type": "application/json" },
        body: JSON.stringify({ model, max_tokens: 800, messages: [{ role: "user", content: prompt }] }),
      });
      const j = (await res.json().catch(() => null)) as { choices?: { message?: { content?: string } }[]; error?: { message?: string } } | null;
      if (!res.ok) throw new Error(j?.error?.message ?? "The call failed.");
      setOut({ text: j?.choices?.[0]?.message?.content ?? "", charge: res.headers.get("x-charge-usd") ?? undefined });
    } catch (e) {
      setError(e instanceof Error ? e.message : "The call failed.");
    } finally {
      setBusy(false);
    }
  }

  if (!keys.length) return <p className="text-[14px] text-ink-2">Redeem a credit into a key first; the playground spends from it.</p>;
  return (
    <div className="grid max-w-4xl gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-[12.5px] text-mute">
          Key
          <select className="field mt-1" value={key?.id} onChange={(e) => setKeyId(e.target.value)}>
            {keys.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label} · {short(k.key)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[12.5px] text-mute">
          Model
          <select className="field mt-1" value={model} onChange={(e) => setModel(e.target.value)}>
            {models.map((m) => (
              <option key={m.slug} value={m.slug}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="text-[12.5px] text-mute">
        Prompt
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={5} className="field mt-1 h-auto py-3 leading-relaxed" placeholder="Ask anything" />
      </label>
      <div>
        <button type="button" className="btn" onClick={run} disabled={busy || !prompt.trim()}>
          {busy ? "Waiting for the model…" : "Run"}
        </button>
      </div>
      {error ? <Note tone="bad">{error}</Note> : null}
      {out ? (
        <div className="tile p-5">
          <p className="text-[14.5px] leading-relaxed whitespace-pre-wrap">{out.text}</p>
          {out.charge ? <p className="mt-3 font-mono text-[12px] text-mute">Charged ${out.charge}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
