const DEFAULT_AFFILIATE_CODE = process.env.ML_AFFILIATE_CODE || "40141155";

export function buildAffiliateUrlFromInput(itemOrUrl: string) {
  const baseUrl = normalizeToUrl(itemOrUrl);
  const url = new URL(baseUrl);
  url.searchParams.set("matt_tool", DEFAULT_AFFILIATE_CODE);
  return url.toString();
}

function normalizeToUrl(itemOrUrl: string) {
  const trimmed = itemOrUrl.trim();

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }

  // Se for só o ID (ex: MLB123456789), monta uma URL padrão de produto no Mercado Livre Brasil.
  return `https://produto.mercadolivre.com.br/${encodeURIComponent(trimmed)}`;
}

