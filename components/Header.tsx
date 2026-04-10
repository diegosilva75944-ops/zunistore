import Link from "next/link";
import Image from "next/image";
import { HeaderCategoryStrip } from "@/components/HeaderCategoryStrip";
import { getDirectSubcategories, orderHeaderCategoriesForStrip } from "@/lib/categories-tree";
import { listHeaderCategories, getSiteCategoriesFlatForNavigationCached, getSiteSettings } from "@/lib/store";
import { SearchBox } from "@/components/SearchBox";

export async function Header() {
  const [settings, headerCategories, navCategories] = await Promise.all([
    getSiteSettings(),
    listHeaderCategories(),
    getSiteCategoriesFlatForNavigationCached(),
  ]);
  const logoUrl = settings?.logo_url ?? null;
  const visibleIds = new Set(navCategories.map((c) => c.id));
  const ordered = orderHeaderCategoriesForStrip(headerCategories.filter((h) => visibleIds.has(h.id)));
  const stripItems = ordered.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    subcategories: getDirectSubcategories(c.id, navCategories).map((s) => ({
      id: s.id,
      name: s.name,
      slug: s.slug,
    })),
  }));

  return (
    <>
      <header className="sticky top-0 z-50 overflow-visible bg-zuni-header text-zuni-white border-b border-white/10">
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

            <nav className="hidden md:flex items-center gap-5 text-sm shrink-0">
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
          </div>
        </div>
      </header>
      <HeaderCategoryStrip items={stripItems} />
    </>
  );
}

