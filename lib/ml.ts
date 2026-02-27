import { prisma } from "./prisma";

const ML_AUTH_BASE_URL = "https://auth.mercadolivre.com.br";
const ML_API_BASE_URL = "https://api.mercadolibre.com";

type MlOAuthResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  user_id: number;
  refresh_token: string;
};

type MlItemResponse = {
  id: string;
  title: string;
  category_id: string;
  price: number;
  permalink: string;
  thumbnail: string;
  pictures?: { url: string }[];
};

function buildAffiliateUrl(permalink: string) {
  // Usa o padrão oficial do seu código de afiliado no Mercado Livre:
  // matt_tool=40141155
  const affiliateCode = process.env.ML_AFFILIATE_CODE || "40141155";
  const url = new URL(permalink);
  url.searchParams.set("matt_tool", affiliateCode);
  return url.toString();
}

export async function exchangeCodeForToken(code: string) {
  const clientId = process.env.ML_CLIENT_ID;
  const clientSecret = process.env.ML_CLIENT_SECRET;
  const redirectUri = process.env.ML_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Variáveis ML_CLIENT_ID, ML_CLIENT_SECRET ou ML_REDIRECT_URI não configuradas.");
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
  });

  const res = await fetch(`${ML_API_BASE_URL}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Erro ao trocar code por token: ${res.status} - ${text}`);
  }

  const data = (await res.json()) as MlOAuthResponse;

  const expiresAt = new Date(Date.now() + data.expires_in * 1000);

  await prisma.mlToken.upsert({
    where: { id: "main" },
    update: {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt,
    },
    create: {
      id: "main",
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt,
    },
  });

  return data;
}

async function refreshAccessToken(refreshToken: string) {
  const clientId = process.env.ML_CLIENT_ID;
  const clientSecret = process.env.ML_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Variáveis ML_CLIENT_ID ou ML_CLIENT_SECRET não configuradas.");
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  });

  const res = await fetch(`${ML_API_BASE_URL}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Erro ao renovar token: ${res.status} - ${text}`);
  }

  const data = (await res.json()) as MlOAuthResponse;
  const expiresAt = new Date(Date.now() + data.expires_in * 1000);

  await prisma.mlToken.upsert({
    where: { id: "main" },
    update: {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt,
    },
    create: {
      id: "main",
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt,
    },
  });

  return data;
}

export async function getValidAccessToken() {
  const token = await prisma.mlToken.findUnique({ where: { id: "main" } });
  if (!token) {
    throw new Error("Nenhum token do Mercado Livre encontrado. Conecte sua conta primeiro.");
  }

  const now = new Date();
  const marginMs = 5 * 60 * 1000;

  if (token.expiresAt.getTime() - now.getTime() <= marginMs) {
    const refreshed = await refreshAccessToken(token.refreshToken);
    return refreshed.access_token;
  }

  return token.accessToken;
}

export async function fetchMlItem(itemIdOrUrl: string): Promise<MlItemResponse> {
  const itemId = extractItemId(itemIdOrUrl);
  const accessToken = await getValidAccessToken();

  const res = await fetch(`${ML_API_BASE_URL}/items/${itemId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Erro ao buscar item ${itemId}: ${res.status} - ${text}`);
  }

  return (await res.json()) as MlItemResponse;
}

function extractItemId(itemIdOrUrl: string) {
  try {
    const url = new URL(itemIdOrUrl);
    const parts = url.pathname.split("/").filter(Boolean);
    const candidate = parts.find((p) => /^ML[B|M]/i.test(p) || /^ML[A-Z]{2}\d+/i.test(p));
    if (candidate) return candidate.toUpperCase();
  } catch {
    // not a URL, treat as raw id
  }
  return itemIdOrUrl.toUpperCase();
}

export async function upsertProductFromMl(itemIdOrUrl: string) {
  const item = await fetchMlItem(itemIdOrUrl);

  const pictures = item.pictures && item.pictures.length > 0
    ? item.pictures.map((p) => p.url)
    : [item.thumbnail];

  const affiliateUrl = buildAffiliateUrl(item.permalink);

  const price = item.price;

  const product = await prisma.product.upsert({
    where: { mlItemId: item.id },
    update: {
      title: item.title,
      category: item.category_id,
      price,
      promoPrice: null,
      offPercent: null,
      description: item.title,
      images: pictures,
      affiliateUrl,
      lastSyncAt: new Date(),
    },
    create: {
      mlItemId: item.id,
      title: item.title,
      slug: item.id.toLowerCase(),
      category: item.category_id,
      price,
      promoPrice: null,
      offPercent: null,
      description: item.title,
      images: pictures,
      affiliateUrl,
      isPromo: false,
      lastSyncAt: new Date(),
    },
  });

  return product;
}

