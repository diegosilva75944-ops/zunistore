import "server-only";

import { resolveMlCatalogUrlForServerFetch } from "./normalize";

/** Reutilizável em outros módulos server (ex.: resolver MLB a partir do HTML da PDP). */
export const ML_FETCH_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
  Referer: "https://www.mercadolivre.com.br/",
  "sec-ch-ua":
    '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
};

const ML_MOBILE_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "pt-BR,pt;q=0.9",
  Referer: "https://www.mercadolivre.com.br/",
};

export const FETCH_TIMEOUT_MS = 35_000;

export type FetchHtmlResult =
  | { ok: true; html: string; finalUrl: string; usedMobileFallback: boolean }
  | { ok: false; status?: number; error: string };

function looksBlocked(html: string): boolean {
  const s = html.slice(0, 320_000).toLowerCase();
  if (
    /ui-pdp-price__main-container|ui-pdp-title|poly-component__price|andes-money-amount__fraction|schema\.org\/product|"@type"\s*:\s*"product"|vpp-frontend|"price"\s*:\s*\{\s*"type"\s*:\s*"price"\s*,\s*"value"/i.test(
      s,
    )
  ) {
    return false;
  }
  return (
    /para continuar,?\s*acesse\s+sua\s+conta/i.test(s) ||
    (/\bsou\s+novo\b/i.test(s) && /\bj[aá]\s+tenho\s+conta\b/i.test(s)) ||
    /ocorreu um erro\.?\s*por favor,?\s*tente novamente/i.test(s) ||
    /entre\s+com\s+sua\s+conta|fa[cç]a\s+login/i.test(s)
  );
}

export async function fetchMlHtml(url: string): Promise<FetchHtmlResult> {
  const resolvedUrl = resolveMlCatalogUrlForServerFetch(url);
  try {
    const res = await fetch(resolvedUrl, {
      cache: "no-store",
      redirect: "follow",
      headers: ML_FETCH_HEADERS,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    const text = await res.text();
    const finalUrl = res.url || resolvedUrl;

    if (!res.ok) {
      return { ok: false, status: res.status, error: `HTTP ${res.status}` };
    }

    if (looksBlocked(text)) {
      const res2 = await fetch(resolvedUrl, {
        cache: "no-store",
        redirect: "follow",
        headers: ML_MOBILE_HEADERS,
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      const text2 = await res2.text();
      const final2 = res2.url || resolvedUrl;
      if (res2.ok && !looksBlocked(text2)) {
        return { ok: true, html: text2, finalUrl: final2, usedMobileFallback: true };
      }
      return { ok: false, error: "Página bloqueada ou sem conteúdo de produto (login/captcha)." };
    }

    return { ok: true, html: text, finalUrl, usedMobileFallback: false };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}
