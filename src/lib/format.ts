/** Micro-units (6 decimals) as a grouped decimal string: 12_500_000n -> "12.50". */
export function formatUsdg(micro: bigint, digits = 2) {
  const neg = micro < 0n;
  const abs = neg ? -micro : micro;
  const whole = abs / 1_000_000n;
  const frac = (abs % 1_000_000n).toString().padStart(6, "0").slice(0, digits);
  const grouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${neg ? "-" : ""}${grouped}${digits > 0 ? `.${frac}` : ""}`;
}

/** 709_571_103 -> "709.6M". */
export function compact(n: number) {
  if (!Number.isFinite(n)) return "–";
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e4) return `${(n / 1e3).toFixed(1)}K`;
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export const usd = (n: number | null | undefined, digits = 2) =>
  n == null || !Number.isFinite(n) ? "–" : `$${n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;

export function ago(unixSeconds: number, now = Date.now() / 1000) {
  const d = Math.max(0, Math.floor(now - unixSeconds));
  if (d < 60) return `${d}s ago`;
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

/** 262_144 -> "262K", 1_048_576 -> "1M". */
export function contextLabel(tokens: number) {
  if (tokens >= 1_000_000) return `${Math.round(tokens / 1_000_000)}M`;
  return `${Math.round(tokens / 1000)}K`;
}
