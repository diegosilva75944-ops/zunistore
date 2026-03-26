"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function NavLink({
  href,
  children,
  active,
}: {
  href: string;
  children: React.ReactNode;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`block rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition ${
        active
          ? "bg-zuni-primary text-white"
          : "text-zinc-700 hover:bg-zuni-purple-light hover:text-zinc-900"
      }`}
    >
      {children}
    </Link>
  );
}

export default function AdminLayoutWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isLogin = pathname === "/admin/login";

  if (isLogin) {
    return (
      <div className="min-h-dvh bg-zinc-50 text-zinc-900">{children}</div>
    );
  }

  return (
    <div className="min-h-dvh bg-zinc-50 text-zinc-900">
      <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white shadow-sm">
        <div className="mx-auto max-w-[1600px] px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/"
              className="rounded-lg px-3 py-2 text-sm font-semibold text-zuni-primary hover:bg-zuni-purple-light"
            >
              ← Voltar ao site
            </Link>
            <span className="text-zinc-300 hidden sm:inline">|</span>
            <nav className="flex flex-wrap items-center gap-1">
              <NavLink href="/admin/produtos" active={pathname.startsWith("/admin/produtos")}>
                Produtos
              </NavLink>
              <NavLink href="/admin/categorias" active={pathname.startsWith("/admin/categorias")}>
                Categorias
              </NavLink>
              <NavLink href="/admin/importacao" active={pathname === "/admin/importacao"}>
                Importação
              </NavLink>
              <NavLink href="/admin/mercadolivre" active={pathname.startsWith("/admin/mercadolivre")}>
                Importar do Mercado Livre
              </NavLink>
              <NavLink href="/admin/tokens" active={pathname.startsWith("/admin/tokens")}>
                Tokens
              </NavLink>
              <NavLink href="/admin/carrossel" active={pathname === "/admin/carrossel"}>
                Carrossel
              </NavLink>
              <NavLink href="/admin/tema" active={pathname === "/admin/tema"}>
                Tema
              </NavLink>
              <NavLink href="/admin/contato" active={pathname === "/admin/contato"}>
                Contato
              </NavLink>
              <NavLink href="/admin/redes-sociais" active={pathname === "/admin/redes-sociais"}>
                Redes sociais
              </NavLink>
              <NavLink href="/admin/seo" active={pathname.startsWith("/admin/seo")}>
                SEO
              </NavLink>
            </nav>
            <form action="/api/admin/logout" method="post" className="ml-auto">
              <button
                type="submit"
                className="rounded-full bg-zuni-orange px-4 py-2 text-xs font-semibold text-zuni-black hover:opacity-95"
              >
                Sair
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-4 py-6">
        <section className="rounded-2xl bg-white ring-1 ring-zinc-200 p-5 md:p-6">
          {children}
        </section>
      </main>
    </div>
  );
}
