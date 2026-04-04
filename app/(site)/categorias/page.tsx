import Link from "next/link";
import { listSiteCategoriesFlat } from "@/lib/store";
import { buildCategoryTree, type CategoryTreeNode } from "@/lib/categories-tree";

export const revalidate = 300;

function SubTree({ node }: { node: CategoryTreeNode }) {
  return (
    <li className="text-sm">
      <Link
        href={`/categoria/${node.slug}`}
        className="text-zinc-600 hover:text-zuni-primary hover:underline"
      >
        {node.name}
      </Link>
      {node.children.length > 0 ? (
        <ul className="mt-1 space-y-1 border-l border-zinc-200 pl-2">
          {node.children.map((ch) => (
            <SubTree key={ch.id} node={ch} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function CategoryColumn({ node }: { node: CategoryTreeNode }) {
  return (
    <li className="min-w-0 break-words">
      <Link
        href={`/categoria/${node.slug}`}
        className="font-semibold text-zuni-purple-dark hover:text-zuni-primary hover:underline"
      >
        {node.name}
      </Link>
      {node.children.length > 0 ? (
        <ul className="mt-2 list-none space-y-1 p-0">
          {node.children.map((ch) => (
            <SubTree key={ch.id} node={ch} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export default async function CategoriasPage() {
  const flat = await listSiteCategoriesFlat();
  const tree = buildCategoryTree(flat);

  return (
    <div className="space-y-6">
      <section className="zuni-site-section space-y-6" aria-labelledby="categorias-heading">
        <div>
          <h1 id="categorias-heading" className="text-2xl font-semibold">
            Categorias
          </h1>
          <p className="mt-1 text-sm text-zinc-600">
            Navegue pelas categorias principais e pelas subcategorias abaixo de cada uma. Ao abrir uma categoria, a listagem
            inclui também os produtos das subcategorias.
          </p>
        </div>

        {tree.length === 0 ? (
          <p className="text-sm text-zinc-500">Nenhuma categoria cadastrada.</p>
        ) : (
          <ul className="m-0 grid list-none grid-cols-2 gap-x-4 gap-y-10 p-0 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {tree.map((node) => (
              <CategoryColumn key={node.id} node={node} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
