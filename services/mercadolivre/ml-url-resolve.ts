import "server-only";

import { extractMlItemIdFromUrl, tryExtractMlItemIdFromUrl } from "@/services/mercadolivre/parser";

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
  return extractMlItemIdFromUrl(finalUrl);
}
