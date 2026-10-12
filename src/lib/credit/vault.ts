"use client";

import { useMemo, useSyncExternalStore } from "react";
import { storageKey } from "@/config/storage";

/*
 * What a buyer keeps in this browser, filed under the wallet that is connected: credits (the two
 * secret numbers, as a backup string), API keys, and a short history. Nothing here is sent to the
 * site. Losing it loses the balance, which is why every screen offers the backup string.
 */

export type CreditStatus = "unpaid" | "paying" | "bought" | "redeemed" | "failed";

export type StoredCredit = {
  id: string;
  face: number;
  backup: string;
  status: CreditStatus;
  /** Practice credits are made while the desk is not deployed: nothing was paid and they fund nothing. */
  practice: boolean;
  tx?: string;
  createdAt: number;
  redeemedAt?: number;
  keyId?: string;
  note?: string;
};

export type StoredKey = { id: string; key: string; label: string; createdAt: number };

export type HistoryEntry = { at: number; kind: "buy" | "redeem" | "call" | "key"; text: string; tx?: string };

export type Vault = { credits: StoredCredit[]; keys: StoredKey[]; history: HistoryEntry[] };

const EMPTY: Vault = { credits: [], keys: [], history: [] };
const EVENT = "q-vault";

const keyFor = (owner: string) => storageKey("vault", owner.toLowerCase());

export function readVault(owner: string): Vault {
  try {
    const raw = window.localStorage.getItem(keyFor(owner));
    if (!raw) return EMPTY;
    const v = JSON.parse(raw) as Partial<Vault>;
    return { credits: v.credits ?? [], keys: v.keys ?? [], history: v.history ?? [] };
  } catch {
    return EMPTY;
  }
}

export function writeVault(owner: string, change: (v: Vault) => Vault) {
  const next = change(readVault(owner));
  next.history = next.history.slice(0, 200);
  window.localStorage.setItem(keyFor(owner), JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(EVENT, { detail: owner.toLowerCase() }));
  return next;
}

export const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export function upsertCredit(owner: string, credit: StoredCredit) {
  return writeVault(owner, (v) => ({ ...v, credits: [credit, ...v.credits.filter((c) => c.id !== credit.id)] }));
}

export function patchCredit(owner: string, id: string, patch: Partial<StoredCredit>) {
  return writeVault(owner, (v) => ({ ...v, credits: v.credits.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
}

export function addHistory(owner: string, entry: Omit<HistoryEntry, "at">) {
  return writeVault(owner, (v) => ({ ...v, history: [{ ...entry, at: Date.now() }, ...v.history] }));
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** Live view of the vault for `owner` (empty when no wallet is connected). */
export function useVault(owner: string | null) {
  // The raw string is the snapshot: it only changes identity when the stored vault changes.
  const raw = useSyncExternalStore(
    subscribe,
    () => (owner ? window.localStorage.getItem(keyFor(owner)) : null),
    () => null,
  );
  return useMemo(() => (owner && raw ? readVault(owner) : EMPTY), [owner, raw]);
}
