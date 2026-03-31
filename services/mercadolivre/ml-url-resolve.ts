import "server-only";

import { FETCH_TIMEOUT_MS, ML_FETCH_HEADERS } from "@/lib/ml-test/fetchHtml";
import { isMercadoLivreProductUrl, normalizeMlFetchUrl } from "@/lib/ml-test/normalize";
import { normalizeMercadoLivreProductUrl, resolveMercadoLivreFetchUrl } from "@/lib/ml-price";
import {
  extractMlItemIdFromProductHtml,
  extractMlItemIdFromUrl,
  tryExtractMlItemIdFromUrl,
} from "@/services/mercadolivre/parser";

/**
 * URLs candidatas para extrair MLB… — **source_url antes de affiliate_url** quando ambos existem,
 * porque `resolveMercadoLivreFetchUrl` prioriza afiliado e links poly/categoria podem não ter MLB no path.
 */
export function listMercadoLivreUrlsForItemExtraction(
  sourceUrl: string | null | undefined,
  affiliateUrl: string | null | undefined,
): string[] {
  const out: string[] = [];

  const addNormalized = (raw: string | null | undefined) => {
    const s = String(raw ?? "").trim();
    if (!s.startsWith("http")) return;
    try {
      const n = normalizeMercadoLivreProductUrl(s, { keepSearch: true });
      const f = normalizeMlFetchUrl(n, { keepSearch: true });
      if (isMercadoLivreProductUrl(f) && !out.includes(f)) out.push(f);
    } catch {
      /* ignore */
    }
  };

  const src = String(sourceUrl ?? "").trim();
  if (src.includes("pdp_filters=")) {
    addNormalized(sourceUrl);
  }

  addNormalized(sourceUrl);

  const aff = String(affiliateUrl ?? "").trim();
  if (aff.startsWith("http")) {
    try {
      const h = new URL(aff).hostname.toLowerCase();
      if (h === "meli.la" || h.endsWith(".meli.la")) {
        const f = normalizeMlFetchUrl(aff, { keepSearch: true });
        if (isMercadoLivreProductUrl(f) && !out.includes(f)) out.push(f);
      }
    } catch {
      /* ignore */
    }
  }

  addNormalized(affiliateUrl);

  const resolved = resolveMercadoLivreFetchUrl(sourceUrl, affiliateUrl);
  if (resolved) {
    try {
      const f = normalizeMlFetchUrl(String(resolved), { keepSearch: true });
      if (isMercadoLivreProductUrl(f) && !out.includes(f)) out.push(f);
    } catch {
      /* ignore */
    }
  }

  return out;
}

const FETCH_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
};

async function followRedirectsToFinalUrl(url: string): Promise<string> {
  try {
    const head = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      headers: FETCH_HEADERS,
      signal: AbortSignal.timeout(20_000),
    });
    if (tryExtractMlItemIdFromUrl(head.url)) return head.url;
  } catch {
    /* HEAD nem sempre suportado */
  }
  const get = await fetch(url, {
    method: "GET",
    redirect: "follow",
    headers: FETCH_HEADERS,
    signal: AbortSignal.timeout(35_000),
  });
  return get.url;
}

async function fetchHtmlBodyForItemResolution(pageUrl: string): Promise<string> {
  const res = await fetch(pageUrl, {
    method: "GET",
    redirect: "follow",
    headers: ML_FETCH_HEADERS,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  return res.text();
}

function pathnameHasMlbuCatalogSegment(pathname: string): boolean {
  return /\/up\/MLBU\d+/i.test(pathname);
}

/**
 * Extrai MLB… da URL; se for link curto (meli.la) ou página que redireciona sem MLB no path inicial,
 * segue redirects HTTP e tenta de novo.
 */
export async function extractMlItemIdFromUrlWithRedirects(input: string): Promise<string> {
  const direct = tryExtractMlItemIdFromUrl(input);
  if (direct) return direct;

  const raw = String(input || "").trim();
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return extractMlItemIdFromUrl(input);
  }

  const host = url.hostname.toLowerCase();
  const isMlHost =
    host.includes("mercadolivre.com") ||
    host.includes("mercadolibre.com") ||
    host === "meli.la" ||
    host.endsWith(".meli.la");
  if (!isMlHost) {
    return extractMlItemIdFromUrl(input);
  }

  const finalUrl = await followRedirectsToFinalUrl(raw);
  const after = tryExtractMlItemIdFromUrl(finalUrl);
  if (after) return after;

  let finalPath = "";
  try {
    finalPath = new URL(finalUrl).pathname;
  } catch {
    finalPath = url.pathname;
  }

  if (pathnameHasMlbuCatalogSegment(url.pathname) || pathnameHasMlbuCatalogSegment(finalPath)) {
    const pageToFetch = pathnameHasMlbuCatalogSegment(url.pathname) ? raw : finalUrl;
    try {
      const html = await fetchHtmlBodyForItemResolution(pageToFetch);
      const fromHtml = extractMlItemIdFromProductHtml(html);
      if (fromHtml) return fromHtml;
    } catch {
      /* segue para throw abaixo */
    }
  }

  return extractMlItemIdFromUrl(finalUrl);
}

/** Tenta extrair MLB em sequência (source antes de affiliate). */
export async function extractMlItemIdFromFirstWorkingCandidate(
  sourceUrl: string | null | undefined,
  affiliateUrl: string | null | undefined,
): Promise<string> {
  const candidates = listMercadoLivreUrlsForItemExtraction(sourceUrl, affiliateUrl);
  let lastErr: Error | null = null;
  for (const url of candidates) {
    try {
      return await extractMlItemIdFromUrlWithRedirects(url);
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
    }
  }
  if (lastErr) throw lastErr;
  throw new Error("Sem URL do Mercado Livre para extrair o anúncio.");
}
