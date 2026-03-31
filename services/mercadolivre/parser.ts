import { MercadoLivreError } from "./errors";

function isMlbItemId(x: string): boolean {
  return /^MLB\d{6,}$/i.test(x.trim());
}

function pushUnique(candidates: string[], id: string | null | undefined) {
  if (id == null || String(id).trim() === "") return;
  const x = String(id).trim().toUpperCase();
  if (!isMlbItemId(x)) return;
  if (!candidates.includes(x)) candidates.push(x);
}

/** Parâmetros típicos de tracking / reco com o anúncio (MLB…) no hash ou na query. */
function pushCandidatesFromSearchParams(candidates: string[], params: URLSearchParams) {
  for (const key of ["wid", "item_id", "itemId"]) {
    const v = params.get(key);
    pushUnique(candidates, v);
  }
  const pdp = params.get("pdp_filters");
  if (pdp) {
    try {
      const decoded = decodeURIComponent(pdp);
      const m = decoded.match(/item_id\s*:\s*(MLB\d{6,})/i);
      if (m?.[1]) pushUnique(candidates, m[1]);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Extrai o item_id (ex: MLB123456789) a partir de URLs públicas do Mercado Livre.
 * Suporta formatos comuns:
 * - https://produto.mercadolivre.com.br/MLB-123456789-titulo-_JM
 * - https://www.mercadolivre.com.br/.../p/MLB123456789
 * - Fragmento `#...&wid=MLB4470085695&...` (links de recomendação; normalizeMlFetchUrl costuma remover o hash)
 * - /up/MLB123… quando o path traz o anúncio direto
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

  const hashQuery = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
  let hashParams: URLSearchParams;
  try {
    hashParams = new URLSearchParams(hashQuery);
  } catch {
    hashParams = new URLSearchParams();
  }

  /** Em páginas /up/… (catálogo / reco) o MLB do anúncio costuma vir no hash (wid) — priorizar. */
  const pathLooksLikeUserProduct = /\/up\/[^/]+/i.test(path);

  if (pathLooksLikeUserProduct) {
    pushCandidatesFromSearchParams(candidates, hashParams);
    pushCandidatesFromSearchParams(candidates, url.searchParams);
  } else {
    pushCandidatesFromSearchParams(candidates, url.searchParams);
    pushCandidatesFromSearchParams(candidates, hashParams);
  }

  // /p/MLB123456789
  const m1 = path.match(/\/p\/(MLB\d{6,})\b/i);
  if (m1?.[1]) pushUnique(candidates, m1[1]);

  // /up/MLB123456789 (anúncio no path, sem prefixo MLBU)
  const mUp = path.match(/\/up\/(MLB\d{6,})\b/i);
  if (mUp?.[1]) pushUnique(candidates, mUp[1]);

  // /MLB-123456789-...
  const m2 = path.match(/\/(MLB)-?(\d{6,})\b/i);
  if (m2?.[1] && m2?.[2]) pushUnique(candidates, `${m2[1]}${m2[2]}`);

  // qualquer ocorrência no path (evita MLBU… de user-product no mesmo segmento)
  const m3 = path.match(/\/(MLB\d{6,})\b/i);
  if (m3?.[1]) pushUnique(candidates, m3[1]);

  const pathSearchHash = `${url.pathname}${url.search}${url.hash}`;
  const m4 = pathSearchHash.match(/\b(MLB\d{6,})\b/gi);
  if (m4) {
    for (const hit of m4) {
      pushUnique(candidates, hit);
    }
  }

  const m5 = url.href.match(/\b(MLB\d{6,})\b/gi);
  if (m5) {
    for (const hit of m5) {
      pushUnique(candidates, hit);
    }
  }

  const id = candidates.find((x) => /^MLB\d{6,}$/.test(x));
  if (!id) {
    throw new MercadoLivreError(
      "invalid_item_id",
      "Não consegui extrair o item_id do link. Tente colar a URL completa do anúncio (incluindo o que vem após # se houver), ou use …/MLB-… / …/p/MLB….",
      { details: { pathname: path, href: url.href } },
    );
  }

  return id;
}

/**
 * Quando a URL só traz catálogo `/up/MLBU…` (sem `wid=MLB…` no hash), o anúncio real aparece no HTML,
 * ex.: `<meta … content="meli://item?id=MLB6100526080"/>`.
 */
export function extractMlItemIdFromProductHtml(html: string): string | null {
  const m = String(html || "").match(/meli:\/\/item\?id=(MLB\d{6,})\b/i);
  if (m?.[1]) return m[1].toUpperCase();
  return null;
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
