/** Paginação exclusiva da home (lista “Todos os Produtos”). */
export const HOME_PER_PAGE_OPTIONS = [12, 24, 36] as const;
export type HomePerPage = (typeof HOME_PER_PAGE_OPTIONS)[number];

export function parseHomePerPage(raw: unknown): HomePerPage {
  const first = Array.isArray(raw) ? raw[0] : raw;
  const n = Number(String(first ?? "").replace(",", "."));
  if (n === 12 || n === 24 || n === 36) return n;
  return 24;
}
