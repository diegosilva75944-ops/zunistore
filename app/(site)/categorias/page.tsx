import Link from "next/link";
import { listSeedCategories } from "@/lib/store";

export const revalidate = 300;

export default async function CategoriasPage() {
  const categories = await listSeedCategories();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Categorias</h1>
        <p className="text-sm text-zinc-600">Navegue por categoria.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
        {categories.map((c) => (
          <Link
            key={c.id}
            href={`/categoria/${c.slug}`}
            className="rounded-2xl bg-white ring-1 ring-zinc-200 hover:ring-zinc-300 transition p-5"
          >
            <div className="font-semibold">{c.name}</div>
            <div className="text-xs text-zinc-600 mt-1">Ver produtos</div>
          </Link>
        ))}
      </div>
    </div>
  );
}

