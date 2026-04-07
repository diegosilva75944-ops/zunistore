/**
 * Validação do link de afiliado alinhada ao sync de preço (ml-price):
 * mesma resolução de URL (hash wid → PDP), headers (Referer, UA) e fallback mobile
 * quando o ML devolve tela de login/HTML sem PDP.
 * Se HTTP não extrair preço, tenta `fetchPricesFromUrlViaPlaywright` (Chromium com janela quando há DISPLAY).
 *
 * `import()` dinâmico evita ciclos de inicialização com `lib/admin/db` no carregamento do bundle.
 */

function isTransientHttpStatus(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

/**
 * Retorna válido se conseguirmos extrair preço da página (mesmo critério do sync).
 * `transient: true` → não marcar link como expirado (bloqueio/rate limit/timeout); tentar de novo depois.
 */
export async function checkAffiliatePageContainsProduct(
  affiliateUrl: string,
  _productTitle: string,
): Promise<{ valid: boolean; error?: string; transient?: boolean }> {
  const trimmed = String(affiliateUrl || "").trim();
  if (!trimmed.startsWith("http")) {
    return { valid: false, error: "URL inválida." };
  }

  try {
    const { fetchPricesFromUrl, fetchPricesFromUrlViaPlaywright } = await import("@/lib/ml-price");
    const result = await fetchPricesFromUrl({
      sourceUrl: null,
      affiliateUrl: trimmed,
    });

    if (result.kind === "ok") {
      return { valid: true };
    }
    if (result.kind === "listing_gone") {
      return { valid: false, error: "Anúncio removido ou indisponível." };
    }

    const pw = await fetchPricesFromUrlViaPlaywright({
      sourceUrl: null,
      affiliateUrl: trimmed,
    });
    if (pw.kind === "ok") {
      return { valid: true };
    }
    if (pw.kind === "listing_gone") {
      return { valid: false, error: "Anúncio removido ou indisponível." };
    }
    if (pw.kind === "http_error") {
      return {
        valid: false,
        error: `HTTP ${pw.status}`,
        transient: isTransientHttpStatus(pw.status),
      };
    }
    if (pw.kind === "blocked") {
      return {
        valid: false,
        error:
          "Mercado Livre bloqueou a leitura (login/captcha). Confira DISPLAY/X11 para a janela do Chromium ou use outro link.",
        transient: true,
      };
    }
    return { valid: false, error: "Preço não detectável mesmo com navegador (layout ou bloqueio)." };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const transient =
      /Tempo esgotado|AbortError|timeout|ECONNRESET|ETIMEDOUT|fetch failed|network/i.test(message);
    return { valid: false, error: message, transient };
  }
}
