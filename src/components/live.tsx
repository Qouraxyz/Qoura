"use client";

import { useChain } from "@/components/providers/ChainProvider";

const fmt = (n: number | null | undefined, digits = 0) => (n === null || n === undefined ? "…" : n.toLocaleString("en-US", { maximumFractionDigits: digits }));

/** One live figure, read by the server from Robinhood Chain (or OKX for the ETH price). */
export function LiveValue({ field, digits = 0, testid }: { field: "block" | "gasGwei" | "ethUsd"; digits?: number; testid?: string }) {
  const { facts, failed } = useChain();
  const v = facts ? facts[field] : null;
  if (failed && v === null) return <span data-testid={testid}>unavailable</span>;
  return <span data-testid={testid}>{fmt(v, digits)}</span>;
}

/** Credits sold by the desk, overall or for one face value. Before deployment: "not yet". */
export function LiveCredits({ face, testid }: { face?: number; testid?: string }) {
  const { facts } = useChain();
  if (!facts) return <span data-testid={testid}>…</span>;
  if (!facts.desk.live) return <span data-testid={testid}>0</span>;
  const v = face === undefined ? facts.desk.credits : (facts.desk.crowds[String(face)] ?? null);
  return <span data-testid={testid}>{fmt(v)}</span>;
}
