import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { getSiteSettings } from "@/lib/store";
import { getOptionalEnv } from "@/lib/env";
import { normalizeThemeColors, themeColorsToHtmlStyle } from "@/lib/theme/normalize-theme-colors";

/**
 * PostgREST usa `fetch(..., { cache: "no-store" })`. Sem isto, o `next build` tenta pré-renderizar
 * rotas e dispara DYNAMIC_SERVER_USAGE em cascata (layout + Header + páginas).
 */
export const dynamic = "force-dynamic";

const env = getOptionalEnv();

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: env?.NEXT_PUBLIC_SITE_URL ? new URL(env.NEXT_PUBLIC_SITE_URL) : undefined,
  title: {
    default: "ZuniStore — Marketplace Afiliado",
    template: "%s | ZuniStore",
  },
  description:
    "ZuniStore é um marketplace afiliado: ao comprar, você é redirecionado para o produto original em nova aba.",
  icons: {
    icon: { url: "/logo-zunistore.png", type: "image/png" },
    apple: "/logo-zunistore.png",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const settings = await getSiteSettings();
  const htmlThemeStyle = themeColorsToHtmlStyle(
    normalizeThemeColors(settings?.colors ?? null),
  );

  return (
    <html lang="pt-BR" style={htmlThemeStyle}>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
