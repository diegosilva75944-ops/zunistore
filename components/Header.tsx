import Link from "next/link";
import Image from "next/image";
import { listHeaderCategories, getSiteSettings } from "@/lib/store";
import { SearchBox } from "@/components/SearchBox";

export async function Header() {
  const [settings, categories] = await Promise.all([getSiteSettings(), listHeaderCategories()]);
  const logoUrl = settings?.logo_url ?? null;

  return (
    <header className="sticky top-0 z-50 bg-zuni-header text-zuni-white border-b border-white/10">
      <div className="zuni-site-container">
        <div className="flex flex-wrap items-center gap-3 sm:gap-4 py-3">
          <Link href="/" className="flex items-center gap-2 shrink-0 min-w-0">
            <Image
              src={logoUrl ?? "/logo-zunistore.png"}
              alt="ZuniStore"
              width={36}
              height={36}
              className="h-8 w-8 sm:h-9 sm:w-9 shrink-0 rounded-lg"
              priority
            />
            <span className="font-semibold tracking-tight text-base sm:text-lg truncate">
              Zuni<span className="text-zuni-yellow">Store</span>
            </span>
          </Link>

          <div className="flex-1 min-w-0 w-full sm:w-auto order-3 sm:order-0">
            <SearchBox />
          </div>

          <nav className="hidden md:flex items-center gap-4 text-sm shrink-0">
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
            className="shrink-0 inline-flex items-center justify-center rounded-full bg-zuni-orange px-3 py-1.5 sm:px-4 sm:py-2 text-xs font-semibold text-zuni-black hover:opacity-95 transition"
          >
            Admin
          </Link>
        </div>

        <div className="flex items-center justify-center gap-2 pb-3 overflow-x-auto overflow-y-hidden">
          {categories.slice(0, 10).map((c) => (
            <Link
              key={c.id}
              href={`/categoria/${c.slug}`}
              className="text-xs bg-white/10 hover:bg-white/15 px-3 py-1.5 rounded-full whitespace-nowrap shrink-0"
            >
              {c.name}
            </Link>
          ))}
        </div>
      </div>
    </header>
  );
}

