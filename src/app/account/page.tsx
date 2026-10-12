import type { Metadata } from "next";
import { Dashboard } from "@/components/account/Dashboard";
import { BRAND } from "@/config/brand";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  path: "/account",
  title: `Dashboard | ${BRAND.name}`,
  description: `Your ${BRAND.name} credits, keys and history, kept in this browser. Redeem a credit into a key with a proof made here, check balances and try a model.`,
  noindex: true,
});

export default function AccountPage() {
  return (
    <div className="wrap pt-14 md:pt-20">
      <h1 className="display">Dashboard</h1>
      <p className="lede mt-4 max-w-2xl">Credits, keys and spending for the connected wallet. Stored only in this browser.</p>
      <div className="mt-12">
        <Dashboard />
      </div>
    </div>
  );
}
