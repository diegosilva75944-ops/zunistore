/** Categoria plana (site / admin). */
export type CategoryFlat = {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
};

export type CategoryTreeNode = CategoryFlat & { children: CategoryTreeNode[] };

/**
 * Monta árvore (raízes = sem pai na lista ou pai órfão). Filhos ordenados por nome.
 */
export function buildCategoryTree(flat: CategoryFlat[]): CategoryTreeNode[] {
  const byId = new Map<string, CategoryTreeNode>();
  for (const c of flat) {
    byId.set(c.id, { ...c, children: [] });
  }
  const roots: CategoryTreeNode[] = [];
  for (const c of flat) {
    const node = byId.get(c.id)!;
    const pid = c.parent_id;
    if (pid && byId.has(pid)) {
      byId.get(pid)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  function sortRecursive(nodes: CategoryTreeNode[]) {
    nodes.sort((a, b) => a.name.localeCompare(b.name, "pt"));
    for (const n of nodes) sortRecursive(n.children);
  }
  sortRecursive(roots);
  return roots;
}

/** A própria categoria + todas as descendentes na lista `flat`. */
export function collectDescendantCategoryIds(
  rootId: string,
  flat: Pick<CategoryFlat, "id" | "parent_id">[],
): string[] {
  const byParent = new Map<string | null, string[]>();
  for (const c of flat) {
    const p = c.parent_id;
    const arr = byParent.get(p) ?? [];
    arr.push(c.id);
    byParent.set(p, arr);
  }
  const out: string[] = [];
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop()!;
    out.push(id);
    const kids = byParent.get(id);
    if (kids) for (const k of kids) stack.push(k);
  }
  return out;
}

export type HeaderNavGroup = { root: CategoryFlat; subs: CategoryFlat[] };

/** Percorre a árvore em profundidade-primeiro (pai antes dos filhos). */
export function flattenCategoryTreeDFS(nodes: CategoryTreeNode[]): CategoryFlat[] {
  const out: CategoryFlat[] = [];
  function walk(n: CategoryTreeNode[]) {
    for (const x of n) {
      out.push({ id: x.id, name: x.name, slug: x.slug, parent_id: x.parent_id });
      if (x.children.length) walk(x.children);
    }
  }
  walk(nodes);
  return out;
}

/** Categorias do cabeçalho na ordem hierárquica (árvore só entre elas). */
export function orderHeaderCategoriesForStrip(headerList: CategoryFlat[]): CategoryFlat[] {
  return flattenCategoryTreeDFS(buildCategoryTree(headerList));
}

/** Filhos diretos no catálogo completo. */
export function getDirectSubcategories(parentId: string, allFlat: CategoryFlat[]): CategoryFlat[] {
  return allFlat
    .filter((c) => c.parent_id === parentId)
    .sort((a, b) => a.name.localeCompare(b.name, "pt"));
}

/** Da folha até a raiz (ordem: raiz → … → folha). */
export function getCategoryBreadcrumbTrail(leafId: string, flat: CategoryFlat[]): CategoryFlat[] {
  const byId = Object.fromEntries(flat.map((c) => [c.id, c])) as Record<string, CategoryFlat | undefined>;
  const trail: CategoryFlat[] = [];
  let cur: CategoryFlat | undefined = byId[leafId];
  const guard = new Set<string>();
  while (cur && !guard.has(cur.id)) {
    guard.add(cur.id);
    trail.unshift(cur);
    cur = cur.parent_id ? byId[cur.parent_id] : undefined;
  }
  return trail;
}

export function groupHeaderCategoriesForNav(headerList: CategoryFlat[]): HeaderNavGroup[] {
  const ids = new Set(headerList.map((c) => c.id));
  const subsByParent = new Map<string, CategoryFlat[]>();
  const roots: CategoryFlat[] = [];
  for (const c of headerList) {
    const pid = c.parent_id;
    if (pid && ids.has(pid)) {
      const arr = subsByParent.get(pid) ?? [];
      arr.push(c);
      subsByParent.set(pid, arr);
    } else {
      roots.push(c);
    }
  }
  roots.sort((a, b) => a.name.localeCompare(b.name, "pt"));
  return roots.map((root) => ({
    root,
    subs: (subsByParent.get(root.id) ?? []).sort((a, b) => a.name.localeCompare(b.name, "pt")),
  }));
}
