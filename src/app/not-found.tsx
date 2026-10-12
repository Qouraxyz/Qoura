import Link from "next/link";
import { Mark } from "@/components/Mark";

export default function NotFound() {
  return (
    <div className="wrap flex min-h-[55vh] flex-col items-start justify-center gap-5 py-20">
      <Mark size={40} />
      <h1 className="display">Nothing on this shelf.</h1>
      <p className="lede max-w-lg">The page you asked for does not exist, or it moved.</p>
      <div className="flex gap-3">
        <Link href="/" className="btn">
          Home
        </Link>
        <Link href="/market" className="btn-line">
          Marketplace
        </Link>
      </div>
    </div>
  );
}
