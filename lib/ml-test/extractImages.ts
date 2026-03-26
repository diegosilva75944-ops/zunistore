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

function resolutionScore(url: string): number {
  const u = String(url || "");
  if (/2X|2x/i.test(u)) return 1000;
  if (/-F[.-]/i.test(u)) return 500;
  if (/-L[.-]/i.test(u)) return 400;
  return 50;
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

/**
 * Galeria principal do PDP — evita recomendações fora de `.ui-pdp-gallery`.
 */
export function extractGalleryImages($: CheerioAPI): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  const seenIds = new Set<string>();

  const add = (raw: string) => {
    const u = normalizeImgUrl(raw);
    if (!u || !isMlImage(u) || u.includes("data:")) return;
    const id = getMlImageId(u);
    if (id) {
      if (seenIds.has(id)) return;
      seenIds.add(id);
    } else if (seen.has(u)) return;
    else seen.add(u);
    result.push(u);
  };

  $(".ui-pdp-gallery__figure").each((_, fig) => {
    const $fig = $(fig);
    const dz =
      $fig.attr("data-zoom") || $fig.attr("data-src") || $fig.attr("data-url");
    if (dz) add(dz);
    const img = $fig.find("img").first();
    if (img.length) {
      add(img.attr("data-zoom") || "");
      add(img.attr("data-src") || img.attr("data-lazy") || "");
      add(img.attr("src") || "");
      const ss = img.attr("srcset");
      const fromSs = pickBestFromSrcset(ss || undefined);
      if (fromSs) add(fromSs);
    }
  });

  $(".ui-pdp-gallery").find("[data-zoom]").each((_, el) => {
    add($(el).attr("data-zoom") || "");
  });

  if (result.length === 0) {
    $(".ui-pdp-gallery img").each((_, el) => {
      const src = $(el).attr("data-zoom") || $(el).attr("src");
      if (src) add(src);
    });
  }

  return result.slice(0, 30);
}
