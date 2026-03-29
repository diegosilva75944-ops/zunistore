import Script from "next/script";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { CookieBanner } from "@/components/CookieBanner";

const GA_MEASUREMENT_ID = "G-CCG95MP9NH";

/** Alinha revalidação do rodapé (contato) com a página /contato. */
export const revalidate = 300;

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
        strategy="afterInteractive"
      />
      <Script id="google-analytics" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${GA_MEASUREMENT_ID}');
        `}
      </Script>
      <div className="min-h-dvh bg-zinc-50 text-zinc-900">
        <Header />
        <main className="zuni-site-container py-6">{children}</main>
        <Footer />
        <CookieBanner />
      </div>
    </>
  );
}

