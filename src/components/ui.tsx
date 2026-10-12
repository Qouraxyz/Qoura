/*
 * Small shared primitives: status pills and a note box.
 */
import { Info, TriangleAlert } from "lucide-react";

export const LivePill = ({ children = "Live" }: { children?: React.ReactNode }) => (
  <span className="pill">
    <span className="size-1.5 rounded-full bg-ok" aria-hidden="true" />
    {children}
  </span>
);
export const PracticePill = ({ children = "Practice" }: { children?: React.ReactNode }) => (
  <span className="pill border-dashed">
    <span className="size-1.5 rounded-full bg-pale" aria-hidden="true" />
    {children}
  </span>
);

export function Note({ tone = "info", children, className = "" }: { tone?: "info" | "warn" | "bad"; children: React.ReactNode; className?: string }) {
  const Icon = tone === "info" ? Info : TriangleAlert;
  const look = tone === "bad" ? "border-alarm/25 bg-alarm/5 text-alarm" : tone === "warn" ? "border-ink/20 bg-mist text-ink-2" : "border-line bg-card text-ink-2";
  return (
    <div className={`flex gap-2.5 rounded-xl border px-3.5 py-3 text-[13.5px] leading-relaxed ${look} ${className}`} role={tone === "bad" ? "alert" : undefined}>
      <Icon size={15} className="mt-0.5 shrink-0" strokeWidth={2} aria-hidden="true" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
