import type { CategoryFlat } from "@/lib/categories-tree";
import { buildCategoryTree, type CategoryTreeNode } from "@/lib/categories-tree";

export type SiteCategorySelectOption = { id: string; slug: string; label: string };

/** Opções ordenadas com caminho «Pai › Filho» para filtros (slug continua único). */
export function siteCategorySelectOptionsWithPath<T extends CategoryFlat>(categories: T[]): SiteCategorySelectOption[] {
  const tree = buildCategoryTree(categories);
  const out: SiteCategorySelectOption[] = [];
  function walk(nodes: CategoryTreeNode[], ancestors: string[]) {
    for (const node of nodes) {
      const label = [...ancestors, node.name].join(" › ");
      out.push({ id: node.id, slug: node.slug, label });
      if (node.children.length) walk(node.children, [...ancestors, node.name]);
    }
  }
  walk(tree, []);
  out.sort((a, b) => a.label.localeCompare(b.label, "pt"));
  return out;
}

/** Chave estável para agrupar nomes visualmente iguais (evita duplicatas na combobox). */
function categoryNameKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Uma entrada por nome de categoria para selects. Em duplicatas com o mesmo nome,
 * mantém o id da categoria do produto atual quando `preferCategoryId` pertence ao grupo.
 */
export function categoriesForSelectByUniqueName<T extends { id: string; name: string }>(
  categories: T[],
  opts?: { preferCategoryId?: string | null },
): T[] {
  const groups = new Map<string, T[]>();
  for (const c of categories) {
    const k = categoryNameKey(c.name);
    const arr = groups.get(k) ?? [];
    arr.push(c);
    groups.set(k, arr);
  }
  const pref = opts?.preferCategoryId?.trim() || null;
  const out: T[] = [];
  for (const group of groups.values()) {
    const chosen =
      pref && group.some((c) => c.id === pref)
        ? group.find((c) => c.id === pref)!
        : group[0];
    out.push(chosen);
  }
  out.sort((a, b) => a.name.localeCompare(b.name, "pt"));
  return out;
}

/**
 * Igual a `categoriesForSelectByUniqueName`, para categorias do site com `slug` no filtro por URL.
 */
export function siteCategoriesForSelectByUniqueName<T extends { id: string; name: string; slug: string }>(
  categories: T[],
  opts?: { preferCategorySlug?: string | null },
): T[] {
  const groups = new Map<string, T[]>();
  for (const c of categories) {
    const k = categoryNameKey(c.name);
    const arr = groups.get(k) ?? [];
    arr.push(c);
    groups.set(k, arr);
  }
  const pref = opts?.preferCategorySlug?.trim() || null;
  const out: T[] = [];
  for (const group of groups.values()) {
    const chosen =
      pref && group.some((c) => c.slug === pref)
        ? group.find((c) => c.slug === pref)!
        : group[0];
    out.push(chosen);
  }
  out.sort((a, b) => a.name.localeCompare(b.name, "pt"));
  return out;
}
