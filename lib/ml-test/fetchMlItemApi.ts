import "server-only";

export type MlItemApiResult =
  | {
      ok: true;
      id: string;
      title: string | null;
      price: number | null;
      originalPrice: number | null;
      currencyId: string | null;
      pictures: string[];
      permalink: string | null;
    }
  | { ok: false; error: string };

type MlItemApiPayload = {
  id?: unknown;
  title?: unknown;
  price?: unknown;
  original_price?: unknown;
  currency_id?: unknown;
  permalink?: unknown;
  pictures?: unknown;
};

function numOrNull(x: unknown): number | null {
  const n = typeof x === "number" ? x : x != null ? Number(x) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

function strOrNull(x: unknown): string | null {
  return typeof x === "string" && x.trim() ? x.trim() : null;
}

export async function fetchMlItemApi(itemId: string): Promise<MlItemApiResult> {
  const id = String(itemId || "").trim().toUpperCase();
  if (!/^MLB\d{6,}$/.test(id)) {
    return { ok: false, error: "item_id inválido para API (esperado MLB...)." };
  }
  try {
    const url = `https://api.mercadolibre.com/items/${id}`;
    const res = await fetch(url, {
      cache: "no-store",
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept: "application/json,text/plain,*/*",
        "Accept-Language": "pt-BR,pt;q=0.9",
      },
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) {
      return { ok: false, error: `API items: HTTP ${res.status}` };
    }
    const json = (await res.json().catch(() => null)) as MlItemApiPayload | null;
    if (!json || typeof json !== "object") {
      return { ok: false, error: "API items: JSON inválido." };
    }
    const picturesRaw = Array.isArray(json.pictures) ? json.pictures : [];
    const pictures = picturesRaw
      .map((p) => (p && typeof p === "object" ? (p as any).secure_url ?? (p as any).url : null))
      .filter((u): u is string => typeof u === "string" && u.startsWith("http"));

    return {
      ok: true,
      id: strOrNull(json.id) ?? id,
      title: strOrNull(json.title),
      price: numOrNull(json.price),
      originalPrice: numOrNull(json.original_price),
      currencyId: strOrNull(json.currency_id),
      pictures,
      permalink: strOrNull(json.permalink),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `API items: ${msg}` };
  }
}

