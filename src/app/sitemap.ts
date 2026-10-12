import type { MetadataRoute } from "next";
import { BRAND } from "@/config/brand";
import { ITEMS } from "@/config/catalog";

// Every indexable page. The dashboard (/account) and the deploy tool stay out.
export const ROUTES = ["", "/market", "/agents", "/whitepaper", "/docs", "/token", "/terms", ...ITEMS.map((i) => `/market/${i.slug}`)];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return ROUTES.map((r) => ({ url: `${BRAND.url}${r}`, lastModified: now, changeFrequency: r === "" ? "daily" : "weekly", priority: r === "" ? 1 : 0.6 }));
}
