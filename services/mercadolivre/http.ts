import "server-only";

import { MercadoLivreError } from "./errors";

const ML_API_ORIGIN = "https://api.mercadolibre.com";
const ML_TIMEOUT_MS = 20_000;

type FetchJsonOpts = {
  /** Caminho absoluto tipo `/items/MLB123` */
  path: string;
  /** Query params opcionais */
  query?: Record<string, string | number | boolean | null | undefined>;
  /** Timeout específico (ms) */
  timeoutMs?: number;
};

function buildUrl(opts: FetchJsonOpts): string {
  const url = new URL(opts.path, ML_API_ORIGIN);
  const q = opts.query ?? {};
  for (const [k, v] of Object.entries(q)) {
    if (v == null) continue;
    const s = String(v);
    if (!s) continue;
    url.searchParams.set(k, s);
  }
  return url.toString();
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseRetryAfterSeconds(res: Response): number | null {
  const h = res.headers.get("retry-after");
  if (!h) return null;
  const n = parseInt(h, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export async function mlFetchJson<T>(opts: FetchJsonOpts): Promise<T> {
  const url = buildUrl(opts);
  const timeoutMs = opts.timeoutMs ?? ML_TIMEOUT_MS;

  // Uma tentativa extra para 429 (rate limit) com backoff curto.
  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        method: "GET",
        cache: "no-store",
        redirect: "follow",
        headers: {
          Accept: "application/json",
          "Accept-Language": "pt-BR,pt;q=0.9",
          "User-Agent":
            "ZuniStoreBot/1.0 (+public-ml-import; no-auth; contact=admin)",
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      const name = e instanceof Error ? e.name : "";
      if (name === "TimeoutError" || name === "AbortError") {
        throw new MercadoLivreError(
          "timeout",
          `Tempo esgotado ao consultar API pública do Mercado Livre (${Math.round(timeoutMs / 1000)}s).`,
          { cause: e },
        );
      }
      throw new MercadoLivreError("network", "Falha de rede ao consultar a API do Mercado Livre.", {
        cause: e,
      });
    }

    if (res.status === 429) {
      const retryAfter = parseRetryAfterSeconds(res);
      console.warn(`[mercadolivre] 429 rate limit em ${url} (attempt=${attempt + 1})`);
      if (attempt === 0) {
        await sleep(Math.min(2500, (retryAfter ?? 2) * 1000));
        continue;
      }
      throw new MercadoLivreError(
        "rate_limited",
        "Rate limit do Mercado Livre atingido. Tente novamente em alguns instantes.",
        { status: 429 },
      );
    }

    const text = await res.text().catch(() => "");
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }

    if (!res.ok) {
      if (res.status === 404) {
        throw new MercadoLivreError("not_found", "Item não encontrado no Mercado Livre.", {
          status: 404,
          details: json ?? text.slice(0, 250),
        });
      }
      throw new MercadoLivreError(
        "unexpected_response",
        `Erro HTTP ${res.status} ao consultar API pública do Mercado Livre.`,
        { status: res.status, details: json ?? text.slice(0, 250) },
      );
    }

    if (json == null) {
      throw new MercadoLivreError(
        "unexpected_response",
        "Resposta vazia/inesperada da API pública do Mercado Livre.",
        { status: res.status, details: text.slice(0, 250) },
      );
    }

    return json as T;
  }

  // unreachable
  throw new MercadoLivreError("unexpected_response", "Falha inesperada ao consultar API do Mercado Livre.");
}

