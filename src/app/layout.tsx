import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Montserrat } from "next/font/google";
import "./globals.css";
import { BRAND } from "@/config/brand";
import { JsonLd } from "@/components/JsonLd";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { ChainProvider } from "@/components/providers/ChainProvider";
import { WalletModalProvider } from "@/components/wallet/WalletButton";
import { WalletProvider } from "@/components/wallet/WalletProvider";
import { HOME_DESCRIPTION, HOME_TITLE, siteLd } from "@/lib/seo";

const body = Montserrat({ subsets: ["latin"], weight: ["300", "400", "500", "600"], variable: "--font-body", display: "swap" });
const code = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-code", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(BRAND.url),
  title: { default: HOME_TITLE, template: `%s | ${BRAND.name}` },
  description: HOME_DESCRIPTION,
  applicationName: BRAND.name,
  alternates: { canonical: "/" },
  openGraph: { type: "website", url: BRAND.url, siteName: BRAND.name, title: HOME_TITLE, description: HOME_DESCRIPTION, locale: "en_US" },
  twitter: { card: "summary_large_image", site: BRAND.xHandle, creator: BRAND.xHandle, title: HOME_TITLE, description: HOME_DESCRIPTION },
};

export const viewport: Viewport = { themeColor: "#f3f4f5" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${body.variable} ${code.variable}`}>
      <head>
        <JsonLd data={siteLd} />
      </head>
      <body>
        <WalletProvider>
          <WalletModalProvider>
            <ChainProvider>
              <a href="#main" className="skip">
                Skip to content
              </a>
              <SiteHeader />
              <main id="main">{children}</main>
              <SiteFooter />
            </ChainProvider>
          </WalletModalProvider>
        </WalletProvider>
      </body>
    </html>
  );
}
