/**
 * Validação do link de afiliado alinhada ao sync de preço (ml-price):
 * mesma resolução de URL (hash wid → PDP), headers (Referer, UA) e fallback mobile
 * quando o ML devolve tela de login/HTML sem PDP.
 *
 * `import()` dinâmico evita ciclos de inicialização com `lib/admin/db` no carregamento do bundle.
 */

/**
 * Retorna válido se conseguirmos extrair preço da página (mesmo critério do sync).
 */
export async function checkAffiliatePageContainsProduct(
  affiliateUrl: string,
  _productTitle: string,
): Promise<{ valid: boolean; error?: string }> {
  const trimmed = String(affiliateUrl || "").trim();
  if (!trimmed.startsWith("http")) {
    return { valid: false, error: "URL inválida." };
  }

  try {
    const { fetchPricesFromUrl } = await import("@/lib/ml-price");
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
    if (result.kind === "http_error") {
      return { valid: false, error: `HTTP ${result.status}` };
    }
    if (result.kind === "blocked") {
      return {
        valid: false,
        error:
          "Mercado Livre bloqueou a leitura automática (login/captcha). Tente sync individual ou outro link.",
      };
    }
    return { valid: false, error: "Preço não detectável na página (layout ou bloqueio)." };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { valid: false, error: message };
  }
}
