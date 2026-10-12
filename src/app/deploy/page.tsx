import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { DeployPanel } from "@/components/deploy/DeployPanel";

export const metadata: Metadata = {
  title: "Deploy contracts",
  description: "Owner tool: deploy the credit desk contracts from your own wallet.",
  robots: { index: false, follow: false },
};

// Owner tool, local only: on any public host this route is a 404.
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

export default async function DeployPage() {
  const host = (await headers()).get("host") ?? "";
  if (!LOCAL_HOST.test(host)) notFound();
  return (
    <div className="wrap max-w-3xl pt-14">
      <h1 className="title">Deploy the credit desk</h1>
      <p className="mt-3 text-[15px] text-mute">Five transactions from your wallet, in order. Nothing here holds a key; every step is signed in the wallet.</p>
      <div className="mt-8">
        <DeployPanel />
      </div>
    </div>
  );
}
