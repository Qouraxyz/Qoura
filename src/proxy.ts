import { NextResponse, type NextRequest } from "next/server";
import { BRAND } from "@/config/brand";

/*
 * Keeps *.vercel.app from competing with the real domain in search results:
 * the production deployment's vercel.app host redirects to the domain, and
 * preview deployments are marked noindex.
 */
export function proxy(request: NextRequest) {
  const host = (request.headers.get("host") ?? "").toLowerCase();
  if (!host.endsWith(".vercel.app")) return NextResponse.next();
  if (process.env.VERCEL_ENV === "production") {
    const url = new URL(request.nextUrl.pathname + request.nextUrl.search, BRAND.url);
    return NextResponse.redirect(url, 308);
  }
  const response = NextResponse.next();
  response.headers.set("X-Robots-Tag", "noindex");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
