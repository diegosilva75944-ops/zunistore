/** Validação e normalização de URL do Mercado Livre (teste interno). */

/**
 * URLs `/up/…` (catálogo + recomendações) definem o anúncio em `wid=MLB…` no **hash** (`#…&wid=MLB…`).
 * Requisições HTTP não enviam fragmentos — o ML costuma responder com erro genérico ou tela de login.
 * Quando houver `wid` (MLB…) extraído do hash, query ou `pdp_filters`, reescreve para PDP `/p/MLB…`.
 */
export function resolveMlCatalogUrlForServerFetch(raw: string): string {
  const s = String(raw || "").trim();
  if (!s) return s;
  try {
    const u = new URL(s);
    const host = u.hostname.toLowerCase();
    if (
      !host.includes("mercadolivre.com") &&
      !host.includes("mercadolibre.com") &&
      host !== "meli.la" &&
      !host.endsWith(".meli.la")
    ) {
      return s;
    }

    let wid: string | null = u.searchParams.get("wid") || u.searchParams.get("item_id");

    const hash = u.hash.startsWith("#") ? u.hash.slice(1) : u.hash;
    if (!wid && hash) {
      try {
        const hp = new URLSearchParams(hash);
        wid = hp.get("wid") || hp.get("item_id");
      } catch {
        /* ignore */
      }
    }

    if (!wid) {
      const pdp = u.searchParams.get("pdp_filters");
      if (pdp) {
        try {
          const decoded = decodeURIComponent(pdp);
          const m = decoded.match(/item_id\s*:\s*(MLB\d{6,})/i);
          if (m?.[1]) wid = m[1];
        } catch {
          /* ignore */
        }
      }
    }

    if (!wid) {
      const hrefMatch = s.match(/[?&#]wid=(MLB\d{6,})\b/i);
      if (hrefMatch?.[1]) wid = hrefMatch[1];
    }

    if (!wid || !/^MLB\d{6,}$/i.test(wid)) {
      return s;
    }

    const mlb = wid.toUpperCase();
    if (/\/p\/MLB\d+/i.test(u.pathname)) {
      return s;
    }

    return `${u.origin}/p/${mlb}`;
  } catch {
    return s;
  }
}

export function isMercadoLivreProductUrl(raw: string): boolean {
  const s = String(raw || "").trim();
  if (!s) return false;
  try {
    const u = new URL(s);
    const h = u.hostname.toLowerCase();
    const ml =
      h.includes("mercadolivre.com") ||
      h.includes("mercadolibre.com") ||
      h === "meli.la" ||
      h.endsWith(".meli.la");
    return ml;
  } catch {
    return false;
  }
}

/**
 * URL “limpa” para fetch estável (catálogo /p/MLB… sem query ruidosa).
 * Mantém search quando necessário para páginas de afiliado/poly (mesma ideia do sync).
 */
export function normalizeMlFetchUrl(raw: string, opts?: { keepSearch?: boolean }): string {
  const s = resolveMlCatalogUrlForServerFetch(String(raw || "").trim());
  if (!s) return s;
  try {
    const u = new URL(s);
    const host = u.hostname.toLowerCase();
    if (
      !host.includes("mercadolivre.com") &&
      !host.includes("mercadolibre.com") &&
      host !== "meli.la" &&
      !host.endsWith(".meli.la")
    ) {
      return s;
    }
    if (opts?.keepSearch) {
      return `${u.origin}${u.pathname}${u.search}`;
    }
    if (/\/p\/MLB\d+/i.test(u.pathname)) {
      return `${u.origin}${u.pathname}`;
    }
    if (/\/MLB-?\d{6,}/i.test(u.pathname)) {
      return `${u.origin}${u.pathname}`;
    }
    return `${u.origin}${u.pathname}`;
  } catch {
    return s;
  }
}

export function parseBRLFromSnippet(text: string): number | null {
  const m = String(text || "").match(/R\$\s*([\d.]+)\s*,\s*(\d{1,2})/i);
  if (!m) {
    const m2 = String(text || "").match(/R\$\s*([\d.]+)(?:\s*,\s*(\d{1,2}))?/i);
    if (!m2) return null;
    const intPart = m2[1].replace(/\./g, "");
    const dec = (m2[2] ?? "00").padEnd(2, "0").slice(0, 2);
    const n = Number(`${intPart}.${dec}`);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  const intPart = m[1].replace(/\./g, "");
  const dec = (m[2] ?? "00").padEnd(2, "0").slice(0, 2);
  const n = Number(`${intPart}.${dec}`);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Percentual de desconto (0–100) com 2 casas, para exibição no preview. */
export function discountPercentFromPair(current: number, original: number): number {
  if (!(original > 0) || !Number.isFinite(current)) return 0;
  const p = (1 - current / original) * 100;
  return roundMoney(Math.min(100, Math.max(0, p)));
}

export function clampPercent(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}

/** Parcelas / “sem juros” — não é o preço principal à vista no bloco. */
export function detectInstallmentKeywords(text: string): boolean {
  return /(\d+\s*x\s*)|parcelad|sem juros|juros|parcela/i.test(String(text || ""));
}

/** Texto típico de preço condicionado ao cartão / crédito (linha secundária). */
export function detectCardPaymentKeywords(text: string): boolean {
  const t = String(text || "").replace(/\s+/g, " ");
  return /\bno\s+cart[aã]o|cart[aã]o\s+de\s+cr[eé]dito|mercado\s+cr[eé]dito|via\s+cart[aã]o|parcelas?\s+no\s+cart|em\s+at[eé]\s+no\s+cart|\bmp\s+cr[eé]dito\b/i.test(
    t,
  );
}

/** Linha que não deve compor o preço “principal” exibido (parcela ou cartão). */
export function detectSecondaryPriceLineText(text: string): boolean {
  return detectInstallmentKeywords(text) || detectCardPaymentKeywords(text);
}

/**
 * ML costuma mostrar Pix à vista e, em subtitles, “ou R$150 em outros meios”.
 * Esse valor é o preço “corrente” fora do Pix — não confundir com parcela/cartão na mesma linha.
 */
export function parsePriceEmOutrosMeiosLine(text: string): number | null {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (!/em\s+outros\s+meios/i.test(t)) return null;
  if (detectInstallmentKeywords(t)) return null;
  if (detectCardPaymentKeywords(t)) return null;
  const m = t.match(/R\$\s*([\d.]+)(?:\s*,\s*(\d{1,2}))?\s+em\s+outros\s+meios/i);
  if (!m) return null;
  const intPart = m[1].replace(/\./g, "");
  const dec = (m[2] ?? "00").padEnd(2, "0").slice(0, 2);
  const v = Number(`${intPart}.${dec}`);
  return Number.isFinite(v) && v > 0 ? roundMoney(v) : null;
}
