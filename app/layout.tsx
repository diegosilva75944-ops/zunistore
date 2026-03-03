import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { getSiteSettings } from "@/lib/store";
import { getOptionalEnv } from "@/lib/env";

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
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const settings = await getSiteSettings();
  const colors = settings?.colors ?? null;
  const cssVars = colors
    ? Object.entries(colors)
        .filter(([k, v]) => k.startsWith("--") && typeof v === "string" && v.trim())
        .map(([k, v]) => `${k}:${v};`)
        .join("")
    : "";

  return (
    <html lang="pt-BR">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {cssVars ? <style>{`:root{${cssVars}}`}</style> : null}
        {children}
      </body>
    </html>
  );
}
