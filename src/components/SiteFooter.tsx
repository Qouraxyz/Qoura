import Link from "next/link";
import { Wordmark } from "@/components/Mark";
import { GithubGlyph, XGlyph } from "@/components/icons";
import { FOOTER_GROUPS } from "@/components/site";
import { BRAND, CHAIN, hasGithub } from "@/config/brand";

export function SiteFooter() {
  return (
    <footer className="mt-28 overflow-hidden border-t border-line">
      <div className="wrap pt-6" aria-hidden="true">
        <div className="footname select-none">{BRAND.name.toUpperCase()}</div>
      </div>
      <div className="wrap grid gap-10 pt-10 pb-8 md:grid-cols-[1.3fr_2fr]">
        <div className="max-w-sm">
          <Wordmark />
          <p className="mt-4 text-[14px] leading-relaxed text-mute">
            AI compute bought on {CHAIN.name}, spent through a key that no wallet points to.
          </p>
          <div className="mt-5 flex gap-2">
            <a href={BRAND.x} target="_blank" rel="noreferrer" aria-label={`${BRAND.name} on X (${BRAND.xHandle})`} className="grid size-9 place-items-center rounded-full border border-line bg-card hover:bg-white">
              <XGlyph size={13} />
            </a>
            {hasGithub ? (
              <a href={BRAND.github} target="_blank" rel="noreferrer" aria-label={`${BRAND.name} on GitHub`} className="grid size-9 place-items-center rounded-full border border-line bg-card hover:bg-white">
                <GithubGlyph size={15} />
              </a>
            ) : null}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
          {FOOTER_GROUPS.map((g) => (
            <div key={g.title}>
              <h2 className="tag">{g.title}</h2>
              <ul className="mt-3 space-y-2">
                {g.links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="text-[14px] text-ink-2 hover:text-ink">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div className="wrap flex flex-col gap-2 border-t border-line py-5 text-[12px] text-mute sm:flex-row sm:justify-between">
        <span>
          © {new Date().getFullYear()} {BRAND.name} · {BRAND.domain}
        </span>
        <span>Credits are issued by {BRAND.name}, spendable only here, and cannot be refunded or transferred.</span>
      </div>
    </footer>
  );
}
