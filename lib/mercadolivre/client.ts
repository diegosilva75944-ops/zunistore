import "server-only";

import { requireMercadoLivreOAuthEnv } from "./oauth-env";
import { getValidMercadoLivreAccessToken } from "./get-valid-token";

export class MercadoLivreApiError extends Error {
  readonly externalStatus: number;
  readonly url: string;
  readonly details?: unknown;

  constructor(message: string, opts: { externalStatus: number; url: string; details?: unknown }) {
    super(message);
    this.name = "MercadoLivreApiError";
    this.externalStatus = opts.externalStatus;
    this.url = opts.url;
    this.details = opts.details;
  }
}

type RequestOpts = {
  path: string;
  query?: Record<string, string | number | boolean | null | undefined>;
};

function buildApiUrl(opts: RequestOpts) {
  const env = requireMercadoLivreOAuthEnv();
  const base = env.MERCADOLIVRE_API_URL.replace(/\/+$/, "");
  const url = new URL(opts.path, base + "/");
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v == null) continue;
    const s = String(v);
    if (!s) continue;
    url.searchParams.set(k, s);
  }
  return url.toString();
}

export async function mlApiGetJson<T = unknown>(opts: RequestOpts): Promise<T> {
  const url = buildApiUrl(opts);
  const { access_token } = await getValidMercadoLivreAccessToken();
  console.log("[ml-api] request", {
    url,
    method: "GET",
    hasAuthToken: Boolean(access_token),
    tokenPreview: access_token ? `${access_token.slice(0, 8)}…${access_token.slice(-4)}` : null,
  });

  const doFetch = async (withAuth: boolean) => {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...(withAuth ? { Authorization: `Bearer ${access_token}` } : null),
      } as any,
      cache: "no-store",
    });
    const text = await res.text().catch(() => "");
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    return { res, body };
  };

  const { res, body } = await doFetch(true);

  if (!res.ok) {
    const errCode =
      body && typeof body === "object" ? (body as any).error ?? (body as any).message : null;
    const isForbidden = res.status === 403 && (errCode === "access_denied" || errCode === "forbidden");
    if (isForbidden) {
      // Alguns endpoints públicos retornam 403 quando autenticados dependendo do token/app.
      // Tentar novamente sem Authorization.
      console.warn("[ml-api] forbidden_with_auth_retry_public", { url, status: res.status, errCode });
      const pub = await doFetch(false);
      if (pub.res.ok) {
        console.log("[ml-api] ok_public_fallback", { url, status: pub.res.status });
        return pub.body as T;
      }
      console.warn("[ml-api] public_fallback_failed", { url, status: pub.res.status, body: pub.body });
    }

    console.warn("[ml-api] non-ok", {
      url,
      status: res.status,
      body,
    });
    throw new MercadoLivreApiError("Falha ao consultar Mercado Livre", {
      externalStatus: res.status,
      url,
      details: body,
    });
  }

  console.log("[ml-api] ok", { url, status: res.status });

  return body as T;
}

