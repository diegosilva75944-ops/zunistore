import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-zinc-50 text-zinc-900">
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      <Footer />
    </div>
  );
}

