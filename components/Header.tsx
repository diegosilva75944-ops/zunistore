import Link from "next/link";
import Image from "next/image";
import { listSeedCategories, getSiteSettings } from "@/lib/store";
import { SearchBox } from "@/components/SearchBox";

export async function Header() {
  const [settings, categories] = await Promise.all([getSiteSettings(), listSeedCategories()]);
  const logoUrl = settings?.logo_url ?? null;

  return (
    <header className="sticky top-0 z-50 bg-zuni-header text-zuni-white border-b border-white/10">
      <div className="mx-auto max-w-6xl px-4">
        <div className="flex items-center gap-4 py-3">
          <Link href="/" className="flex items-center gap-2 shrink-0">
            {logoUrl ? (
              <Image
                src={logoUrl}
                alt="ZuniStore"
                width={140}
                height={32}
                className="h-8 w-auto"
                priority
              />
            ) : (
              <span className="font-semibold tracking-tight text-lg">
                Zuni<span className="text-zuni-yellow">Store</span>
              </span>
            )}
          </Link>

          <div className="flex-1">
            <SearchBox />
          </div>

          <nav className="hidden md:flex items-center gap-4 text-sm">
            <Link href="/" className="hover:underline">
              Início
            </Link>
            <Link href="/categorias" className="hover:underline">
              Categorias
            </Link>
            <Link href="/contato" className="hover:underline">
              Contato
            </Link>
          </nav>

          <Link
            href="/admin"
            className="ml-2 inline-flex items-center justify-center rounded-full bg-zuni-orange px-4 py-2 text-xs font-semibold text-zuni-black hover:opacity-95 transition"
          >
            Admin
          </Link>
        </div>

        <div className="hidden md:flex items-center gap-2 pb-3 overflow-auto">
          {categories.slice(0, 10).map((c) => (
            <Link
              key={c.id}
              href={`/categoria/${c.slug}`}
              className="text-xs bg-white/10 hover:bg-white/15 px-3 py-1 rounded-full whitespace-nowrap"
            >
              {c.name}
            </Link>
          ))}
        </div>
      </div>
    </header>
  );
}

