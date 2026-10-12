"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Copy, ExternalLink } from "lucide-react";
import { useClipboard } from "@/components/CopyCa";
import { LiveCredits } from "@/components/live";
import { Note } from "@/components/ui";
import { useWalletModal } from "@/components/wallet/WalletButton";
import { useWallet } from "@/components/wallet/WalletProvider";
import { BRAND, CHAIN, USDG } from "@/config/brand";
import { FACES, FACE_MAX, FACE_MIN } from "@/config/catalog";
import { CREDIT_DESK, deskLive } from "@/config/contracts";
import { ethCall, explain, formatUnits, tokenBalance, txUrl, waitReceipt } from "@/lib/client";
import { approveCall, authorizationRequest, buyCall, readAllowance, readQuote, relayBody, submitRelay } from "@/lib/credit/client";
import { encodeCredit, makeCredit } from "@/lib/credit/core";
import { addHistory, newId, patchCredit, upsertCredit } from "@/lib/credit/vault";

type Stage =
  | { kind: "idle" }
  | { kind: "working"; text: string }
  | { kind: "done"; id: string; backup: string; tx?: string; practice: boolean }
  | { kind: "error"; text: string };

/**
 * Buys one credit. With the desk deployed: a signed USDG authorization carried by the relayer (no gas),
 * or approve + buy from the wallet when no relayer is configured. Before deployment: a practice credit
 * made and kept in this browser, with nothing paid.
 */
export function BuyPanel({ coverage }: { coverage?: (face: number) => string }) {
  const { address, onRobinhoodChain, chainId, switchNetwork, switching, signTypedData, sendTransaction } = useWallet();
  const { open } = useWalletModal();
  const [face, setFace] = useState<number>(1);
  const [other, setOther] = useState(false);
  const [typed, setTyped] = useState("");
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  // Reads are filed under what they were read for, so a stale answer is never shown for new inputs.
  const [quoteRead, setQuoteRead] = useState<{ at: string; value: { price: bigint; holder: boolean } } | null>(null);
  const [usdgRead, setUsdgRead] = useState<{ at: string; value: bigint } | null>(null);
  const live = deskLive();
  const wrong = Boolean(address && chainId !== null && !onRobinhoodChain);
  const valid = Number.isInteger(face) && face >= FACE_MIN && face <= FACE_MAX;
  const { copied, copy } = useClipboard();

  const quoteAt = `${address}:${face}`;
  const quote = quoteRead?.at === quoteAt ? quoteRead.value : null;
  const usdg = address && usdgRead?.at === address ? usdgRead.value : null;

  useEffect(() => {
    if (!live || !address || !valid) return;
    let stop = false;
    readQuote(ethCall, CREDIT_DESK.address, address, face)
      .then((value) => !stop && setQuoteRead({ at: `${address}:${face}`, value }))
      .catch(() => undefined);
    return () => {
      stop = true;
    };
  }, [live, address, face, valid]);

  useEffect(() => {
    if (!address) return;
    let stop = false;
    tokenBalance(USDG.address, address)
      .then((value) => !stop && setUsdgRead({ at: address, value }))
      .catch(() => undefined);
    return () => {
      stop = true;
    };
  }, [address, stage.kind]);

  const price = quote?.price ?? BigInt(face) * 1_000_000n;

  async function buy() {
    if (!address || !valid) return;
    const credit = makeCredit(face);
    const backup = encodeCredit(credit);
    const id = newId();
    // The credit is saved before anything is signed, so a payment can never land without its secret.
    upsertCredit(address, { id, face, backup, status: live ? "unpaid" : "bought", practice: !live, createdAt: Date.now() });

    if (!live) {
      addHistory(address, { kind: "buy", text: `Practice credit, $${face}` });
      setStage({ kind: "done", id, backup, practice: true });
      return;
    }

    try {
      const q = await readQuote(ethCall, CREDIT_DESK.address, address, face);
      const balance = await tokenBalance(USDG.address, address);
      if (balance < q.price) throw new Error(`This wallet holds ${formatUnits(balance, 6, 2)} USDG; the credit costs ${formatUnits(q.price, 6, 2)}.`);
      patchCredit(address, id, { status: "paying" });

      let hash: string | null = null;
      setStage({ kind: "working", text: "Sign the USDG authorization in your wallet" });
      const { auth, typedData } = authorizationRequest({ desk: CREDIT_DESK.address, from: address, credit, value: q.price });
      const signature = await signTypedData(typedData);
      setStage({ kind: "working", text: "Handing the signed payment to the relayer" });
      try {
        hash = await submitRelay(relayBody(credit, auth, signature));
      } catch (relayError) {
        const msg = relayError instanceof Error ? relayError.message : "";
        if (!/not configured|unavailable|503/i.test(msg)) throw relayError;
        // No relayer on this deployment: pay from the wallet instead (needs a little ETH for gas).
        const allowance = await readAllowance(ethCall, USDG.address, address, CREDIT_DESK.address);
        if (allowance < q.price) {
          setStage({ kind: "working", text: "Approve USDG for the desk (wallet transaction 1 of 2)" });
          await waitReceipt(await sendTransaction(approveCall(USDG.address, CREDIT_DESK.address, q.price)));
        }
        setStage({ kind: "working", text: "Pay for the credit (wallet transaction 2 of 2)" });
        hash = await sendTransaction(buyCall(CREDIT_DESK.address, credit));
      }
      patchCredit(address, id, { tx: hash });
      setStage({ kind: "working", text: "Waiting for Robinhood Chain to include the payment" });
      await waitReceipt(hash);
      patchCredit(address, id, { status: "bought" });
      addHistory(address, { kind: "buy", text: `Bought a $${face} credit for ${formatUnits(q.price, 6, 2)} USDG`, tx: hash });
      setStage({ kind: "done", id, backup, tx: hash, practice: false });
    } catch (error) {
      patchCredit(address, id, { status: "failed", note: explain(error, "The purchase did not go through.") });
      setStage({ kind: "error", text: explain(error, "The purchase did not go through. Nothing was charged.") });
    }
  }

  const busy = stage.kind === "working";

  return (
    <div className="tile p-5 md:p-6" data-testid="buy-panel">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[19px] font-medium tracking-tight">Buy a credit</h2>
        {live ? <span className="pill">On {CHAIN.name}</span> : <span className="pill border-dashed">Practice mode</span>}
      </div>

      <fieldset className="mt-4">
        <legend className="text-[12.5px] text-mute">Face value</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {FACES.map((f) => (
            <button
              key={f}
              type="button"
              disabled={busy}
              onClick={() => {
                setOther(false);
                setFace(f);
              }}
              aria-pressed={!other && face === f}
              className={`h-9 min-w-12 rounded-[10px] border px-3 text-[13.5px] transition-colors ${!other && face === f ? "border-ink bg-ink text-snow" : "border-line bg-white hover:border-ink/40"}`}
            >
              ${f}
            </button>
          ))}
          <button
            type="button"
            disabled={busy}
            onClick={() => setOther(true)}
            aria-pressed={other}
            className={`h-9 rounded-[10px] border px-3 text-[13.5px] ${other ? "border-ink bg-ink text-snow" : "border-line bg-white hover:border-ink/40"}`}
          >
            Other
          </button>
        </div>
        {other ? (
          <label className="mt-3 block">
            <span className="sr-only">Whole dollars</span>
            <input
              inputMode="numeric"
              value={typed}
              onChange={(e) => {
                const t = e.target.value.replace(/\D/g, "").slice(0, 4);
                setTyped(t);
                setFace(Number(t || 0));
              }}
              placeholder={`Whole dollars, ${FACE_MIN} to ${FACE_MAX}`}
              className="field"
            />
            <span className="mt-1.5 block text-[12px] text-mute">An unusual amount has a small crowd. The listed amounts hide you better.</span>
          </label>
        ) : null}
      </fieldset>

      {coverage && valid ? <p className="mt-4 text-[13.5px] text-ink-2">{coverage(face)}</p> : null}

      <dl className="mt-4 space-y-1.5 border-t border-line pt-4 text-[13px]">
        <div className="flex justify-between gap-4">
          <dt className="text-mute">You pay</dt>
          <dd className="font-mono">
            {valid ? formatUnits(price, 6, 2) : "–"} USDG {quote?.holder ? <span className="pill ml-1 h-5 text-[10.5px]">holder price</span> : null}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-mute">Credits at ${valid ? face : "–"} so far</dt>
          <dd className="font-mono">{valid && live ? <LiveCredits face={face} /> : live ? "–" : "0"}</dd>
        </div>
        {address ? (
          <div className="flex justify-between gap-4">
            <dt className="text-mute">USDG in wallet</dt>
            <dd className="font-mono">{usdg === null ? "…" : formatUnits(usdg, 6, 2)}</dd>
          </div>
        ) : null}
      </dl>

      <div className="mt-5">
        {!address ? (
          <button type="button" className="btn w-full" onClick={open} data-testid="buy-connect">
            Connect a wallet to buy
          </button>
        ) : wrong ? (
          <button type="button" className="btn w-full" onClick={switchNetwork} disabled={switching}>
            {switching ? "Confirm in wallet…" : `Switch to ${CHAIN.name}`}
          </button>
        ) : (
          <button type="button" className="btn w-full" onClick={buy} disabled={busy || !valid} data-testid="buy-submit">
            {busy ? stage.text : live ? `Pay ${valid ? formatUnits(price, 6, 2) : "–"} USDG` : `Make a practice $${valid ? face : "–"} credit`}
            {busy ? null : <ArrowRight size={15} />}
          </button>
        )}
      </div>

      {stage.kind === "error" ? (
        <Note tone="bad" className="mt-4">
          {stage.text}
        </Note>
      ) : null}

      {stage.kind === "done" ? (
        <div className="mt-4 rounded-xl border border-ink/20 bg-mist p-4 text-[13px]" data-testid="buy-done">
          <p className="flex items-center gap-2 font-medium">
            <Check size={15} /> {stage.practice ? "Practice credit saved in this browser" : "Credit bought and saved in this browser"}
          </p>
          <p className="mt-1.5 leading-relaxed text-ink-2">
            Keep a copy of the backup below somewhere safe. It is the only thing that can redeem this credit, and {BRAND.name} cannot recover it.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg border border-line bg-white px-2.5 py-2 font-mono text-[11px]">{stage.backup}</code>
            <button type="button" className="btn-line btn-sm" onClick={() => copy(stage.backup, "backup")}>
              {copied === "backup" ? <Check size={13} /> : <Copy size={13} />} Copy
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
            <Link href="/account" className="link">
              Redeem in the dashboard
            </Link>
            {stage.tx ? (
              <a href={txUrl(stage.tx)} target="_blank" rel="noreferrer" className="link inline-flex items-center gap-1">
                Payment on the explorer <ExternalLink size={12} />
              </a>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="mt-5 space-y-2 text-[12px] leading-relaxed text-mute">
        {live ? (
          <p>Paid in USDG on {CHAIN.name}. You sign one message; the relayer pays the gas when it is switched on, otherwise your wallet does.</p>
        ) : (
          <p>
            The credit desk contract is not deployed yet. A practice credit runs the whole flow in this browser, proof included, but nothing is paid and it
            funds no key.
          </p>
        )}
        <p>Anyone can see this payment on chain; nobody can tell which key it ends up funding. No refunds, no transfers.</p>
      </div>
    </div>
  );
}
