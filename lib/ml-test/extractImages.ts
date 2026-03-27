import type { CheerioAPI } from "cheerio";

function normalizeImgUrl(u: string): string {
  let s = String(u || "").trim();
  if (!s) return "";
  if (s.startsWith("//")) s = "https:" + s;
  return s;
}

function isMlImage(u: string): boolean {
  return /^https?:\/\//.test(u) && (u.includes("mlstatic.com") || u.includes("mercadolivre"));
}

/** Quanto maior, melhor a variante (evita ficar com thumb quando existe -O / 2x). */
function resolutionScore(url: string): number {
  const u = String(url || "");
  let s = 0;
  if (/2X|2x/i.test(u)) s += 2000;
  if (/-O\.(webp|jpg|jpeg|png)/i.test(u)) s += 1500;
  if (/-F[.-]/i.test(u) || /_F\.(webp|jpg)/i.test(u)) s += 500;
  if (/-L[.-]/i.test(u) || /_L\.(webp|jpg)/i.test(u)) s += 400;
  if (/-M[.-]/i.test(u) || /_M\.(webp|jpg)/i.test(u)) s += 200;
  const dim = u.match(/(\d{3,4})[x×](\d{3,4})/i);
  if (dim) {
    s += Math.min(parseInt(dim[1], 10), 4096) + Math.min(parseInt(dim[2], 10), 4096);
  }
  return s;
}

function pickBestFromSrcset(srcset: string | undefined): string | null {
  if (!srcset) return null;
  let best: string | null = null;
  let bestScore = -1;
  for (const part of srcset.split(",")) {
    const seg = part.trim();
    if (!seg) continue;
    const url = seg.split(/\s+/)[0];
    if (!url) continue;
    const sc = resolutionScore(url);
    if (sc > bestScore) {
      bestScore = sc;
      best = url;
    }
  }
  return best;
}

function getMlImageId(url: string): string | null {
  const m = String(url).match(/\/(\d+-[A-Z0-9]+_\d+)(?:[-.]|[-.a-z0-9]*\.(webp|jpg|jpeg|png))/i);
  return m ? m[1] : null;
}

function stripQueryForKey(u: string): string {
  return u.split("?")[0];
}

function pickBestUrl(candidates: (string | undefined)[]): string | null {
  let best: string | null = null;
  let bestScore = -1;
  for (const raw of candidates) {
    const u = normalizeImgUrl(raw || "");
    if (!u || !isMlImage(u) || u.includes("data:")) continue;
    const sc = resolutionScore(u);
    if (sc > bestScore) {
      bestScore = sc;
      best = u;
    }
  }
  return best;
}

/**
 * Galeria principal do PDP — evita recomendações fora de `.ui-pdp-gallery`.
 * Deduplica por ID de asset do ML e mantém só a URL de maior resolução.
 */
export function extractGalleryImages($: CheerioAPI): string[] {
  const bestByKey = new Map<string, string>();
  const order: string[] = [];
  const seenKey = new Set<string>();

  const consider = (raw: string) => {
    const u = normalizeImgUrl(raw);
    if (!u || !isMlImage(u) || u.includes("data:")) return;
    const id = getMlImageId(u);
    const key = id || stripQueryForKey(u);
    const sc = resolutionScore(u);
    const prev = bestByKey.get(key);
    if (prev !== undefined && resolutionScore(prev) >= sc) return;
    bestByKey.set(key, u);
    if (!seenKey.has(key)) {
      seenKey.add(key);
      order.push(key);
    }
  };

  const figureCandidates = (fig: Parameters<CheerioAPI["fn"]>[0]) => {
    const $fig = $(fig);
    const candidates: string[] = [];
    const dz = $fig.attr("data-zoom") || $fig.attr("data-src") || $fig.attr("data-url");
    if (dz) candidates.push(dz);
    const img = $fig.find("img").first();
    if (img.length) {
      const dzImg = img.attr("data-zoom");
      if (dzImg) candidates.push(dzImg);
      const ds = img.attr("data-src") || img.attr("data-lazy");
      if (ds) candidates.push(ds);
      const fromSs = pickBestFromSrcset(img.attr("srcset"));
      if (fromSs) candidates.push(fromSs);
      const src = img.attr("src");
      if (src) candidates.push(src);
    }
    return candidates;
  };

  $(".ui-pdp-gallery__figure").each((_, fig) => {
    const best = pickBestUrl(figureCandidates(fig));
    if (best) consider(best);
  });

  $(".ui-pdp-gallery")
    .find("[data-zoom]")
    .each((_, el) => {
      consider($(el).attr("data-zoom") || "");
    });

  if (order.length === 0) {
    $(".ui-pdp-gallery img").each((_, el) => {
      const img = $(el);
      const best = pickBestUrl([
        img.attr("data-zoom"),
        img.attr("data-src"),
        img.attr("src"),
        pickBestFromSrcset(img.attr("srcset")) ?? undefined,
      ]);
      if (best) consider(best);
    });
  }

  const out = order.map((k) => bestByKey.get(k)).filter((u): u is string => Boolean(u));
  return out.slice(0, 30);
}
