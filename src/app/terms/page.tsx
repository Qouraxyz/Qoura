import type { Metadata } from "next";
import { BRAND, CHAIN } from "@/config/brand";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  path: "/terms",
  title: `Terms | ${BRAND.name}`,
  description: `The terms for using ${BRAND.name}: what a credit is, refunds, keys you hold yourself, third-party model suppliers and the risks of software on ${CHAIN.name}.`,
});

const TERMS: [string, string][] = [
  ["What you buy", `A credit is prepaid balance for compute sold on ${BRAND.name}. It is issued by ${BRAND.name}, spendable only here, and is not a deposit, a security or a balance with any model maker.`],
  ["No refunds, no transfers", "Credits and key balances cannot be refunded, exchanged back to USDG, or moved between people by us. A payment on chain is final."],
  ["You hold the secrets", `Credit backups and API keys are made and kept on your device. ${BRAND.name} never receives a credit's secrets and cannot restore a lost credit or key.`],
  ["Suppliers", "Models and image renderers are run by third-party suppliers. Their output can be wrong, offensive or unsuitable; you decide how to use it. Prices follow the suppliers and can change."],
  ["Acceptable use", "Do not use the gateway for anything unlawful where you or the supplier are, to attack other systems, or to abuse the gasless relayer. Keys used that way may be refused service."],
  ["Software risk", `The credit desk contract and the redeem circuit run on ${CHAIN.name} and have not been independently audited yet. Bugs, chain outages or supplier outages can interrupt service or cause loss.`],
  ["The token", `${BRAND.symbol} lowers credit prices for holders. It promises no return, dividend or redemption, and its market price can fall to zero.`],
  ["Rules where you live", `${BRAND.name} does not claim approval from any regulator. You are responsible for using it lawfully where you are.`],
  ["Changes", "These terms can change as the product changes. The version on this page is the one that applies."],
];

export default function TermsPage() {
  return (
    <div className="wrap pt-14 md:pt-20">
      <h1 className="display">Terms</h1>
      <p className="lede mt-5 max-w-2xl">Plain terms for a plain product. Read them before you buy a credit.</p>
      <dl className="mt-12 max-w-3xl border-t border-line">
        {TERMS.map(([t, d]) => (
          <div key={t} className="grid gap-2 border-b border-line py-6 md:grid-cols-[220px_1fr]">
            <dt className="text-[16px] font-medium">{t}</dt>
            <dd className="text-[15px] leading-relaxed text-ink-2">{d}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
