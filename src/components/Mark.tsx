/*
 * The QOURA mark: the owner's pixel-art Q with a magnifier handle, traced cell by cell from
 * ../referensi/1x1 solid.png (../referensi/tools/trace-logo.mjs). Dark cells only: the ring's
 * centre and the handle's inside stay open, so the mark reads on light and dark grounds alike.
 * ../referensi/tools/make-brand.mjs reads MARK_PATH for the favicon, icons and share cards.
 */
export const MARK_PATH = "M12 0h8v1h-8zM10 1h14v1h-14zM8 2h18v1h-18zM6 3h22v1h-22zM6 4h22v1h-22zM4 5h25v1h-25zM4 6h25v1h-25zM3 7h11v1h-11zM20 7h10v1h-10zM3 8h9v1h-9zM22 8h8v1h-8zM2 9h8v1h-8zM24 9h7v1h-7zM2 10h8v1h-8zM24 10h7v1h-7zM0 11h9v1h-9zM25 11h7v1h-7zM0 12h9v1h-9zM25 12h7v1h-7zM0 13h8v1h-8zM26 13h6v1h-6zM0 14h8v1h-8zM26 14h6v1h-6zM0 15h8v1h-8zM26 15h6v1h-6zM0 16h8v1h-8zM26 16h6v1h-6zM0 17h8v1h-8zM26 17h6v1h-6zM0 18h8v1h-8zM26 18h6v1h-6zM2 19h7v1h-7zM22 19h10v1h-10zM2 20h7v1h-7zM22 20h10v1h-10zM2 21h8v1h-8zM20 21h3v1h-3zM27 21h4v1h-4zM2 22h8v1h-8zM20 22h3v1h-3zM28 22h3v1h-3zM3 23h9v1h-9zM20 23h2v1h-2zM29 23h3v1h-3zM3 24h11v1h-11zM20 24h2v1h-2zM30 24h3v1h-3zM4 25h19v1h-19zM31 25h3v1h-3zM5 26h19v1h-19zM32 26h3v1h-3zM6 27h19v1h-19zM33 27h3v1h-3zM7 28h19v1h-19zM34 28h3v1h-3zM8 29h19v1h-19zM35 29h3v1h-3zM12 30h10v1h-10zM25 30h3v1h-3zM36 30h3v1h-3zM26 31h3v1h-3zM37 31h3v1h-3zM27 32h3v1h-3zM38 32h2v1h-2zM28 33h3v1h-3zM38 33h2v1h-2zM29 34h3v1h-3zM38 34h2v1h-2zM30 35h3v1h-3zM37 35h3v1h-3zM31 36h3v1h-3zM36 36h3v1h-3zM32 37h6v1h-6zM34 38h2v1h-2z";

export function Mark({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" className={`shrink-0 ${className}`} fill="currentColor" shapeRendering="crispEdges">
      <path d={MARK_PATH} />
    </svg>
  );
}

/** Mark + bold wordmark, as on the owner's banner. Used in the header and footer. */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <Mark size={24} />
      <span className="text-[15px] font-semibold tracking-[0.14em]">QOURA</span>
    </span>
  );
}
