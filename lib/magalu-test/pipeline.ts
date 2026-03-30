import "server-only";

import type { PriceCandidate } from "@/lib/ml-test/types";
import type { MagaluImportMode, TestMagaluImportResult } from "./types";
import { extractMagaluFromHtml } from "./extractFromHtml";
import { fetchMagaluHtml } from "./fetchHtml";
import { fetchHtmlWithPlaywright } from "@/lib/ml-test/extractWithBrowser";
import { isWeakResolved } from "@/lib/ml-test/resolvePreviewPricing";
import { isMagaluProductUrl } from "./normalize";

function finalize(
  data: Omit<TestMagaluImportResult, "debug">,
  candidates: PriceCandidate[],
  globalSteps: string[],
  layerSteps: string[],
  rawSignals: Record<string, unknown>,
): TestMagaluImportResult {
  return {
    ...data,
    debug: {
      candidates,
      extractionSteps: [...globalSteps, ...layerSteps],
      rawSignals,
      chosenBlock: null,
      chosenSignals: {},
      usedCandidates: [],
      ignoredCandidates: [],
      discardReasons: [],
    },
  };
}

function preferLonger(a: string, b: string): string {
  return b.length > a.length ? b : a;
}

function mergeMagaluLayers(
  a: ReturnType<typeof extractMagaluFromHtml>,
  b: ReturnType<typeof extractMagaluFromHtml>,
): ReturnType<typeof extractMagaluFromHtml> {
  const da = a.data;
  const db = b.data;
  const specs = { ...da.specs, ...db.specs };
  const images = da.images.length >= db.images.length ? da.images : db.images;
  const categoryPath =
    db.categoryPath.length >= da.categoryPath.length ? db.categoryPath : da.categoryPath;
  const categoryName = db.categoryName || da.categoryName;
  const pricing =
    db.pricing.currentPrice != null && !isWeakResolved(db.pricing) ? db.pricing : da.pricing;
  const title = db.title || da.title;
  const fullDescription = preferLonger(da.fullDescription, db.fullDescription);
  const shortDescription = preferLonger(da.shortDescription, db.shortDescription);
  const rating = db.rating ?? da.rating;
  const reviewsCount =
    db.reviewsCount != null && da.reviewsCount != null ?
      Math.max(db.reviewsCount, da.reviewsCount)
    : (db.reviewsCount ?? da.reviewsCount);
  const productIdFromUrl = db.productIdFromUrl || da.productIdFromUrl;

  return {
    data: {
      title,
      shortDescription,
      fullDescription,
      images,
      rating,
      reviewsCount,
      categoryPath,
      categoryName,
      productIdFromUrl,
      specs,
      pricing,
    },
    candidates: [...a.candidates, ...b.candidates],
    extractionSteps: [...a.extractionSteps, "--- merge headless ---", ...b.extractionSteps],
  };
}

export async function runTestMagaluImport(
  rawUrl: string,
  mode: MagaluImportMode,
): Promise<TestMagaluImportResult> {
  if (!isMagaluProductUrl(rawUrl)) {
    throw new Error(
      "Informe uma URL do Magazine Você / Magalu com o padrão …/p/CÓDIGO/… (ex.: magazinevoce.com.br/…/p/240466500/…).",
    );
  }

  const fetchUrl = rawUrl.trim();
  const globalSteps: string[] = [`URL: ${fetchUrl}`, `Modo: ${mode}`];

  if (mode === "headless") {
    const pw = await fetchHtmlWithPlaywright(fetchUrl);
    if (!pw.ok) {
      throw new Error(pw.error || "Playwright falhou ao abrir a página.");
    }
    globalSteps.push(`Playwright: HTML ${pw.html.length} chars (final: ${pw.finalUrl})`);
    const ex = extractMagaluFromHtml(pw.html, pw.finalUrl);
    return finalize(ex.data, ex.candidates, globalSteps, ex.extractionSteps, {
      fetchUrl,
      finalUrl: pw.finalUrl,
      layer: "headless",
    });
  }

  const fetched = await fetchMagaluHtml(fetchUrl);
  if (!fetched.ok) {
    throw new Error(fetched.error || `Falha ao baixar a página (${fetched.status ?? "?"})`);
  }
  globalSteps.push(`Fetch HTTP: ${fetched.html.length} chars`);

  let ex = extractMagaluFromHtml(fetched.html, fetched.finalUrl);

  if (mode === "auto" && isWeakResolved(ex.data.pricing)) {
    globalSteps.push("Preço ausente ou fraco → tentando Playwright…");
    const pw = await fetchHtmlWithPlaywright(fetchUrl);
    if (pw.ok) {
      globalSteps.push(`Playwright: ${pw.html.length} chars`);
      const headless = extractMagaluFromHtml(pw.html, pw.finalUrl);
      ex = mergeMagaluLayers(ex, headless);
    } else {
      globalSteps.push(`Playwright não usado: ${pw.error}`);
    }
  }

  return finalize(ex.data, ex.candidates, globalSteps, ex.extractionSteps, {
    fetchUrl,
    finalUrl: fetched.finalUrl,
    layer: mode === "auto" ? "auto" : "html",
  });
}
