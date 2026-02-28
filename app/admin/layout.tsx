import Link from "next/link";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-zinc-50 text-zinc-900">
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="flex items-center justify-between">
          <Link href="/" className="text-sm font-semibold text-zuni-primary hover:underline">
            ← Voltar ao site
          </Link>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-[240px_1fr]">
          <aside className="rounded-2xl bg-white ring-1 ring-zinc-200 p-4 h-fit">
            <div className="text-xs font-semibold text-zinc-500 mb-2">Admin</div>
            <nav className="space-y-1 text-sm">
              <Nav href="/admin/produtos">Produtos</Nav>
              <Nav href="/admin/importacao">Importação</Nav>
              <Nav href="/admin/tokens">Tokens</Nav>
              <Nav href="/admin/carrossel">Carrossel</Nav>
              <Nav href="/admin/tema">Tema</Nav>
              <Nav href="/admin/contato">Contato</Nav>
              <Nav href="/admin/redes-sociais">Redes sociais</Nav>
              <Nav href="/admin/seo">SEO Programático</Nav>
            </nav>

            <form action="/api/admin/logout" method="post" className="pt-4">
              <button className="w-full rounded-full bg-zuni-orange px-4 py-2 text-xs font-semibold text-zuni-black hover:opacity-95">
                Sair
              </button>
            </form>
          </aside>

          <section className="rounded-2xl bg-white ring-1 ring-zinc-200 p-5">
            {children}
          </section>
        </div>
      </div>
    </div>
  );
}

function Nav({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="block rounded-xl px-3 py-2 hover:bg-zuni-purple-light"
    >
      {children}
    </Link>
  );
}

