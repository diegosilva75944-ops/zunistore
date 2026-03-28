/**
 * Normalização alinhada à coluna gerada `products.title_norm` no Postgres:
 * lower(trim(regexp_replace(title, '\\s+', ' ', 'g')))
 */
export function normalizeProductTitleNorm(title: string): string {
  return String(title || "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
