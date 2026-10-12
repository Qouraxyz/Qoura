"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Copy, ExternalLink, KeyRound, Landmark, LogOut, RefreshCw, Store, TriangleAlert, Wallet, X } from "lucide-react";
import { Mark } from "@/components/Mark";
import { BRAND, CHAIN as chain, explorerAddress, shortAddress } from "@/config/brand";
import { WALLETCONNECT_RDNS, useWallet, type DiscoveredWallet } from "@/components/wallet/WalletProvider";
import { WALLET_CATALOG, catalogIcon } from "@/config/wallets";

/* ------------------------------------------------------------------ */
/* One dialog for the whole site. Every "connect" button opens it      */
/* through this context instead of owning a copy of it.                */
/* ------------------------------------------------------------------ */

const ModalContext = createContext<{ open: () => void } | null>(null);

export function WalletModalProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const value = useCallback(() => setOpen(true), []);
  return (
    <ModalContext.Provider value={{ open: value }}>
      {children}
      {open ? <WalletDialog onClose={() => setOpen(false)} /> : null}
    </ModalContext.Provider>
  );
}

export function useWalletModal() {
  const context = useContext(ModalContext);
  if (!context) throw new Error("useWalletModal must be used inside WalletModalProvider");
  return context;
}

const isMobile = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

function WalletIcon({ src }: { src: string | null }) {
  return src ? (
    <img src={src} alt="" width={28} height={28} className="size-7 rounded-[7px]" />
  ) : (
    <span className="grid size-7 place-items-center rounded-[7px] bg-mist">
      <Wallet size={14} className="text-mute" />
    </span>
  );
}

const ROW =
  "flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left text-[14px] font-medium transition-colors enabled:hover:border-line enabled:hover:bg-white disabled:cursor-not-allowed";
const GROUP = "tag mb-1.5 block px-1";

function WalletDialog({ onClose }: { onClose: () => void }) {
  const { wallets, connect, connecting, error, clearError } = useWallet();
  const [pending, setPending] = useState<string | null>(null);

  const close = useCallback(() => {
    onClose();
    clearError();
  }, [onClose, clearError]);

  useEffect(() => {
    // Late-loading extensions announce on request, so ask again on open.
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [close]);

  const installed = wallets
    .filter((w) => w.rdns !== WALLETCONNECT_RDNS)
    .sort((a, b) => Number(Boolean(a.unsupported)) - Number(Boolean(b.unsupported)));
  const walletConnect = wallets.find((w) => w.rdns === WALLETCONNECT_RDNS) ?? null;
  const detected = new Set(wallets.map((w) => w.rdns));
  const more = WALLET_CATALOG.filter((c) => !c.rdns.some((r) => detected.has(r)));
  const mobile = isMobile();
  const here = window.location.href;

  async function pick(wallet: DiscoveredWallet) {
    setPending(wallet.rdns);
    const ok = await connect(wallet);
    setPending(null);
    if (ok) onClose();
  }

  // The dialog always goes to <body>, so no header style can ever clip it.
  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-ink/35 p-0 backdrop-blur-[2px] sm:items-center sm:p-6"
      onClick={(e) => e.target === e.currentTarget && close()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="wallet-dialog-title"
        className="flex max-h-[88vh] w-full max-w-[440px] flex-col overflow-hidden rounded-t-[22px] border border-line bg-paper shadow-[0_30px_80px_-20px_rgba(13,14,16,0.45)] sm:rounded-[22px]"
        data-testid="wallet-dialog"
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-6">
          <div>
            <h2 id="wallet-dialog-title" className="text-[22px] font-light tracking-tight">
              Connect a wallet
            </h2>
            <p className="mt-1 text-[13.5px] leading-relaxed text-mute">
              Your address is all a connection shares. Each signature or payment is asked for separately, when you press for it.
            </p>
          </div>
          <button type="button" aria-label="Close" onClick={close} className="grid size-8 shrink-0 place-items-center rounded-full border border-line bg-card hover:bg-white">
            <X size={15} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 pt-5 pb-3">
          {installed.length ? (
            <div>
              <span className={GROUP}>Detected in this browser</span>
              {installed.map((wallet) => (
                <button
                  key={wallet.rdns}
                  type="button"
                  disabled={connecting || Boolean(wallet.unsupported)}
                  onClick={() => pick(wallet)}
                  className={`${ROW} ${wallet.unsupported ? "opacity-55" : ""}`}
                  data-testid={`wallet-${wallet.rdns}`}
                >
                  <WalletIcon src={wallet.icon || catalogIcon(wallet.rdns)} />
                  <span className="min-w-0 flex-1">
                    {wallet.name}
                    <span className="block text-[12px] font-normal text-mute">{wallet.unsupported ? `Not supported · ${wallet.unsupported}` : "Installed"}</span>
                  </span>
                  {pending === wallet.rdns ? <span className="pill">Check wallet</span> : null}
                </button>
              ))}
            </div>
          ) : null}

          <div>
            <span className={GROUP}>Phone and other wallets</span>
            {walletConnect ? (
              <button type="button" disabled={connecting} onClick={() => pick(walletConnect)} className={ROW} data-testid="wallet-walletconnect">
                <WalletIcon src="/wallets/walletconnect.webp" />
                <span className="min-w-0 flex-1">
                  WalletConnect
                  <span className="block text-[12px] font-normal text-mute">Scan a QR code with a phone wallet</span>
                </span>
                {pending === WALLETCONNECT_RDNS ? <span className="pill">Opening</span> : null}
              </button>
            ) : (
              <div className={`${ROW} opacity-60`} data-testid="wallet-walletconnect">
                <WalletIcon src="/wallets/walletconnect.webp" />
                <span className="min-w-0 flex-1">
                  WalletConnect
                  <span className="block text-[12px] font-normal text-mute">Not configured on this site yet</span>
                </span>
              </div>
            )}
          </div>

          {more.length ? (
            <div>
              <span className={GROUP}>{mobile ? "Open this site in a wallet app" : `Not installed · works with ${chain.name}`}</span>
              {more.map((w) => {
                const href = mobile && w.deepLink ? w.deepLink(here) : w.install;
                const label = mobile && w.deepLink ? "Open" : "Install";
                return (
                  <a key={w.id} href={href} target="_blank" rel="noreferrer" className={`${ROW} hover:border-line hover:bg-white`}>
                    <WalletIcon src={`/wallets/${w.id}.webp`} />
                    <span className="min-w-0 flex-1">{w.name}</span>
                    <span className="inline-flex items-center gap-1 text-[12.5px] text-mute">
                      {label} <ExternalLink size={12} />
                    </span>
                  </a>
                );
              })}
            </div>
          ) : null}
        </div>

        {error ? (
          <div role="alert" className="mx-6 mb-3 flex gap-2 rounded-xl border border-alarm/25 bg-alarm/5 px-3 py-2.5 text-[13px] text-alarm">
            <TriangleAlert size={15} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        <p className="border-t border-line px-6 py-3.5 font-mono text-[11.5px] text-mute">
          {chain.name} · chain id {chain.id} · added to your wallet on connect
        </p>
      </div>
    </div>,
    document.body,
  );
}

/* ------------------------------------------------------------------ */
/* Navbar control                                                      */
/* ------------------------------------------------------------------ */

export function NavWallet() {
  const { address } = useWallet();
  const { open } = useWalletModal();
  if (address) return <AccountMenu />;
  return (
    <button type="button" onClick={open} className="btn btn-sm" data-testid="nav-connect">
      Connect
    </button>
  );
}

const MI = "flex w-full items-center gap-2.5 px-4 py-2 text-left text-[13.5px] text-ink-2 hover:bg-mist [&>svg]:size-4 [&>svg]:text-mute";

function AccountMenu() {
  const { address, walletName, chainId, balance, onRobinhoodChain, switchNetwork, switching, disconnect, error } = useWallet();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [place, setPlace] = useState<{ top: number; left: number } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const WIDTH = 288;
    const position = () => {
      const rect = root.current?.getBoundingClientRect();
      if (!rect) return;
      const left = Math.max(8, Math.min(rect.right - WIDTH, window.innerWidth - WIDTH - 8));
      setPlace({ top: rect.bottom + 8, left });
    };
    position();
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!root.current?.contains(target) && !menu.current?.contains(target)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", position, true);
    window.addEventListener("resize", position);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", position, true);
      window.removeEventListener("resize", position);
    };
  }, [open]);

  if (!address) return null;
  const wrongNetwork = chainId !== null && !onRobinhoodChain;

  return (
    <div ref={root} className="flex min-w-0 items-center">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-[34px] items-center gap-2 rounded-full border border-line bg-card pr-2.5 pl-3 font-mono text-[12px] hover:border-ink/40"
        title={wrongNetwork ? `Wallet is on chain ${chainId}, not ${chain.name}` : `Connected on ${chain.name}`}
        data-testid="account-chip"
      >
        <span className={`size-2 rounded-full ${wrongNetwork ? "bg-alarm" : "bg-ok"}`} data-testid="account-dot" aria-hidden="true" />
        <span className="whitespace-nowrap">{shortAddress(address, 5, 4)}</span>
        <ChevronDown size={13} className="hidden text-mute sm:block" />
      </button>

      {open && place
        ? createPortal(
            <div
              ref={menu}
              role="menu"
              style={{ position: "fixed", top: place.top, left: place.left, width: 288, zIndex: 80 }}
              className="overflow-hidden rounded-2xl border border-line bg-paper shadow-[0_24px_60px_-18px_rgba(13,14,16,0.4)]"
              data-testid="account-menu"
            >
              <div className="border-b border-line px-4 pt-3.5 pb-3">
                <span className="tag">{walletName ?? "Wallet"}</span>
                <span className="mt-1 block font-mono text-[12.5px] text-ink">{shortAddress(address, 10, 8)}</span>
              </div>
              <div className="border-b border-line px-4 py-3">
                <span className="tag">Balance</span>
                <span className="mt-0.5 block text-[22px] font-light tracking-tight" data-testid="account-balance">
                  {balance === null ? "…" : `${balance} ${chain.nativeSymbol}`}
                </span>
                <span className="mt-2 flex items-center justify-between gap-2">
                  <span className={`pill ${wrongNetwork ? "border-alarm/30 text-alarm" : ""}`} data-testid="account-network">
                    <span className={`size-1.5 rounded-full ${wrongNetwork ? "bg-alarm" : "bg-ok"}`} />
                    {chainId === null ? "Reading network" : onRobinhoodChain ? `On ${chain.name}` : `Chain ${chainId}`}
                  </span>
                  {wrongNetwork ? (
                    <button type="button" role="menuitem" disabled={switching} onClick={switchNetwork} className="btn btn-sm" data-testid="account-switch">
                      <RefreshCw size={13} /> {switching ? "Confirm…" : "Switch"}
                    </button>
                  ) : null}
                </span>
                {wrongNetwork && error ? <p className="mt-2 text-[12px] text-alarm">{error}</p> : null}
              </div>
              <div className="py-1.5">
                <Link role="menuitem" href="/account" onClick={() => setOpen(false)} className={MI}>
                  <KeyRound /> Open app · credits and keys
                </Link>
                <Link role="menuitem" href="/market" onClick={() => setOpen(false)} className={MI}>
                  <Store /> Marketplace
                </Link>
                <button
                  type="button"
                  role="menuitem"
                  className={MI}
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(address);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1800);
                    } catch {
                      // Clipboard refused; the address above stays readable.
                    }
                  }}
                >
                  {copied ? <Check /> : <Copy />} {copied ? "Copied to clipboard" : "Copy address"}
                </button>
                <a role="menuitem" href={explorerAddress(address)} target="_blank" rel="noreferrer" className={MI}>
                  <ExternalLink /> View on explorer
                </a>
                <Link role="menuitem" href="/token" onClick={() => setOpen(false)} className={MI}>
                  <Landmark /> {BRAND.symbol}
                </Link>
                <button
                  type="button"
                  role="menuitem"
                  className={`${MI} text-alarm [&>svg]:text-alarm`}
                  onClick={() => {
                    setOpen(false);
                    disconnect();
                  }}
                  data-testid="account-disconnect"
                >
                  <LogOut /> Disconnect
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

/** Empty-state block: the mark, a sentence, and the connect button. */
export function ConnectEmpty({ children, label = "Connect wallet" }: { children: React.ReactNode; label?: string }) {
  const { address, onRobinhoodChain, chainId, switchNetwork, switching } = useWallet();
  const { open } = useWalletModal();
  const wrong = Boolean(address && chainId !== null && !onRobinhoodChain);
  return (
    <div className="flex flex-col items-start gap-4">
      <Mark size={34} />
      <div className="max-w-md text-[15px] text-ink-2">{children}</div>
      {wrong ? (
        <button type="button" className="btn" onClick={switchNetwork} disabled={switching}>
          {switching ? "Confirm in wallet…" : `Switch to ${chain.name}`}
        </button>
      ) : (
        <button type="button" className="btn" onClick={open} data-testid="empty-connect">
          {label}
        </button>
      )}
    </div>
  );
}
