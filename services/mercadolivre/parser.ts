import { MercadoLivreError } from "./errors";

/**
 * Extrai o item_id (ex: MLB123456789) a partir de URLs públicas do Mercado Livre.
 * Suporta formatos comuns:
 * - https://produto.mercadolivre.com.br/MLB-123456789-titulo-_JM
 * - https://www.mercadolivre.com.br/.../p/MLB123456789
 * - links com query/afiliado/reco etc
 */
export function extractMlItemIdFromUrl(input: string): string {
  const raw = String(input || "").trim();
  if (!raw) {
    throw new MercadoLivreError("invalid_link", "Informe um link do Mercado Livre.");
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch (e) {
    throw new MercadoLivreError("invalid_link", "Link inválido. Cole a URL completa do anúncio.", { cause: e });
  }

  const host = url.hostname.toLowerCase();
  const isMl =
    host.includes("mercadolivre.com") ||
    host.includes("mercadolibre.com") ||
    host === "meli.la" ||
    host.endsWith(".meli.la");
  if (!isMl) {
    throw new MercadoLivreError("invalid_link", "Este link não parece ser do Mercado Livre.");
  }

  const path = url.pathname;
  const candidates: string[] = [];

  // /p/MLB123456789
  const m1 = path.match(/\/p\/(MLB\d{6,})\b/i);
  if (m1?.[1]) candidates.push(m1[1].toUpperCase());

  // /MLB-123456789-...
  const m2 = path.match(/\/(MLB)-?(\d{6,})\b/i);
  if (m2?.[1] && m2?.[2]) candidates.push(`${m2[1]}${m2[2]}`.toUpperCase());

  // qualquer ocorrência no path
  const m3 = path.match(/\b(MLB\d{6,})\b/i);
  if (m3?.[1]) candidates.push(m3[1].toUpperCase());

  // Query / fragment (ex.: ?item_id=MLB…, tracking, afiliado)
  const pathSearchHash = `${url.pathname}${url.search}${url.hash}`;
  const m4 = pathSearchHash.match(/\b(MLB\d{6,})\b/i);
  if (m4?.[1]) candidates.push(m4[1].toUpperCase());

  // URL inteira (hostname raro ou MLB só no meio do href)
  const m5 = url.href.match(/\b(MLB\d{6,})\b/i);
  if (m5?.[1]) candidates.push(m5[1].toUpperCase());

  const id = candidates.find((x) => /^MLB\d{6,}$/.test(x));
  if (!id) {
    throw new MercadoLivreError(
      "invalid_item_id",
      "Não consegui extrair o item_id do link. Tente colar a URL do anúncio do produto (…/MLB-… ou …/p/MLB…).",
      { details: { pathname: path, href: url.href } },
    );
  }

  return id;
}

/** Não lança — útil para tentar redirect depois. */
export function tryExtractMlItemIdFromUrl(input: string): string | null {
  try {
    return extractMlItemIdFromUrl(input);
  } catch {
    return null;
  }
}

export function isValidMlItemId(id: string): boolean {
  return /^MLB\d{6,}$/.test(String(id || "").trim().toUpperCase());
}

