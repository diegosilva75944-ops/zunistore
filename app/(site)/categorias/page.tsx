import Link from "next/link";
import { listSiteCategoriesFlat } from "@/lib/store";

export const revalidate = 300;

export default async function CategoriasPage() {
  const categories = await listSiteCategoriesFlat();
  const byId = Object.fromEntries(categories.map((c) => [c.id, c]));

  return (
    <div className="space-y-6">
      <section className="zuni-site-section space-y-6" aria-labelledby="categorias-heading">
        <div>
          <h1 id="categorias-heading" className="text-2xl font-semibold">
            Categorias
          </h1>
          <p className="text-sm text-zinc-600">
            Navegue por categoria (inclui categorias importadas do Mercado Livre).
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
        {categories.map((c) => (
          <Link
            key={c.id}
            href={`/categoria/${c.slug}`}
            className="rounded-2xl bg-white ring-1 ring-zinc-200 hover:ring-zinc-300 transition p-5"
          >
            <div className="font-semibold">{c.name}</div>
            {c.parent_id && byId[c.parent_id] ? (
              <div className="text-xs text-zinc-500 mt-0.5">Em {byId[c.parent_id].name}</div>
            ) : null}
            <div className="text-xs text-zinc-600 mt-1">Ver produtos</div>
          </Link>
        ))}
        </div>
      </section>
    </div>
  );
}

