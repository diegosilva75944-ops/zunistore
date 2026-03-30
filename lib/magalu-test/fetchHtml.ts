import "server-only";

const MAGALU_FETCH_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
  Referer: "https://www.magazinevoce.com.br/",
};

export const MAGALU_FETCH_TIMEOUT_MS = 35_000;

export type MagaluFetchResult =
  | { ok: true; html: string; finalUrl: string }
  | { ok: false; status?: number; error: string };

export async function fetchMagaluHtml(url: string): Promise<MagaluFetchResult> {
  try {
    const res = await fetch(url, {
      cache: "no-store",
      redirect: "follow",
      headers: MAGALU_FETCH_HEADERS,
      signal: AbortSignal.timeout(MAGALU_FETCH_TIMEOUT_MS),
    });
    const text = await res.text();
    const finalUrl = res.url || url;
    if (!res.ok) {
      return { ok: false, status: res.status, error: `HTTP ${res.status}` };
    }
    return { ok: true, html: text, finalUrl };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}
