/**
 * Padrão para `column=ilike.<valor>` no PostgREST.
 * Não use `encodeURIComponent` aqui: `URLSearchParams` / `buildUrl` já codificam `%` uma vez.
 * Codificar antes gera %2525 e o ILIKE deixa de encontrar nada.
 */
export function ilikeContainsPattern(term: string): string {
  const escaped = String(term)
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");
  return "%" + escaped + "%";
}
