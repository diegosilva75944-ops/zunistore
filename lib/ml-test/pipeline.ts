import "server-only";

import type { ImportMode, TestMlImportResult } from "./types";
import { extractFromHtml } from "./extractFromHtml";
import { fetchMlHtml } from "./fetchHtml";
import { fetchHtmlWithPlaywright } from "./extractWithBrowser";
import { makeShortDescription, preferLongerText } from "./extractDescriptions";
import { preferMaxNullable } from "./extractReviews";
import { isMercadoLivreProductUrl, normalizeMlFetchUrl } from "./normalize";
import { isWeakResolved, mergeResolvedDisplay, resolvePreviewPricing } from "./resolvePreviewPricing";

export async function runTestMlImport(
  rawUrl: string,
  mode: ImportMode,
): Promise<TestMlImportResult> {
  if (!isMercadoLivreProductUrl(rawUrl)) {
    throw new Error("Informe uma URL do Mercado Livre (mercadolivre.com.br/… ou meli.la/…).");
  }

  const fetchUrl = normalizeMlFetchUrl(rawUrl, { keepSearch: true });
  const globalSteps: string[] = [`URL normalizada: ${fetchUrl}`, `Modo: ${mode}`];

  if (mode === "headless") {
    const pw = await fetchHtmlWithPlaywright(fetchUrl);
    if (!pw.ok) {
      throw new Error(pw.error || "Playwright falhou ao abrir a página.");
    }
    globalSteps.push(`Playwright: HTML ${pw.html.length} chars (final: ${pw.finalUrl})`);
    const extracted = extractFromHtml(pw.html, "headless");
    const resolved = resolvePreviewPricing(pw.html, extracted.candidates, "headless");
    return {
      title: extracted.title,
      shortDescription: extracted.shortDescription,
      fullDescription: extracted.fullDescription,
      images: extracted.images,
      rating: extracted.rating,
      reviewsCount: extracted.reviewsCount,
      categoryPath: extracted.categoryPath,
      categoryName: extracted.categoryName,
      pricing: resolved.pricing,
      debug: {
        candidates: extracted.candidates,
        extractionSteps: [...globalSteps, ...extracted.extractionSteps],
        rawSignals: { ...extracted.rawSignals, fetchUrl, layer: "headless" },
        chosenBlock: resolved.chosenBlock,
        chosenSignals: resolved.chosenSignals,
        usedCandidates: resolved.usedCandidates,
        ignoredCandidates: resolved.ignoredCandidates,
        discardReasons: resolved.discardReasons,
      },
    };
  }

  const fetched = await fetchMlHtml(fetchUrl);

  let initialHtml: string;
  let initialLayer: "fetch-http" | "headless" = "fetch-http";
  let usedPlaywrightFirst = false;

  if (!fetched.ok) {
    if (mode === "auto") {
      globalSteps.push(`HTTP indisponível ou bloqueado: ${fetched.error}. Tentando Playwright…`);
      const pw = await fetchHtmlWithPlaywright(fetchUrl);
      if (!pw.ok) {
        throw new Error(pw.error || fetched.error || "Falha ao abrir a página.");
      }
      initialHtml = pw.html;
      initialLayer = "headless";
      usedPlaywrightFirst = true;
      globalSteps.push(`Playwright (fallback): ${initialHtml.length} chars (final: ${pw.finalUrl})`);
    } else {
      throw new Error(fetched.error || `Falha ao baixar a página (${fetched.status ?? "?"})`);
    }
  } else {
    initialHtml = fetched.html;
    globalSteps.push(
      `Fetch HTTP: ${initialHtml.length} chars${fetched.usedMobileFallback ? " (UA mobile)" : ""}`,
    );
  }

  let extracted = extractFromHtml(initialHtml, initialLayer);
  let resolved = resolvePreviewPricing(
    initialHtml,
    extracted.candidates,
    initialLayer === "headless" ? "headless" : "html",
  );
  let candidates = [...extracted.candidates];
  let htmlSource = resolved.pricing.source;

  const missingTitle = !extracted.title?.trim();
  if (
    mode === "auto" &&
    !usedPlaywrightFirst &&
    (isWeakResolved(resolved.pricing) || missingTitle)
  ) {
    globalSteps.push(
      missingTitle && !isWeakResolved(resolved.pricing) ?
        "Sem título no HTML → tentando Playwright…"
      : "Heurística fraca ou sem preço → tentando Playwright…",
    );
    const pw = await fetchHtmlWithPlaywright(fetchUrl);
    if (pw.ok) {
      globalSteps.push(`Playwright: ${pw.html.length} chars`);
      const headlessExtract = extractFromHtml(pw.html, "headless");
      const headlessResolved = resolvePreviewPricing(pw.html, headlessExtract.candidates, "headless");
      const fetchLen = candidates.length;
      resolved = mergeResolvedDisplay(resolved, headlessResolved, fetchLen);
      candidates = [...candidates, ...headlessExtract.candidates];
      const mergedFull = preferLongerText(extracted.fullDescription, headlessExtract.fullDescription);
      const mergedTitle = headlessExtract.title || extracted.title;
      const mergedShort = preferLongerText(extracted.shortDescription, headlessExtract.shortDescription);
      const mergedCategoryPath =
        headlessExtract.categoryPath.length >= extracted.categoryPath.length ?
          headlessExtract.categoryPath
        : extracted.categoryPath;
      const mergedCategoryName = headlessExtract.categoryName || extracted.categoryName;
      extracted = {
        ...extracted,
        title: mergedTitle,
        images: extracted.images.length ? extracted.images : headlessExtract.images,
        fullDescription: mergedFull,
        shortDescription: mergedShort.trim() || makeShortDescription(mergedFull, mergedTitle),
        rating: headlessExtract.rating ?? extracted.rating,
        reviewsCount: preferMaxNullable(extracted.reviewsCount, headlessExtract.reviewsCount),
        categoryPath: mergedCategoryPath,
        categoryName: mergedCategoryName,
      };
      globalSteps.push(...headlessExtract.extractionSteps);
      htmlSource = resolved.pricing.source;
    } else {
      globalSteps.push(`Playwright não usado: ${pw.error}`);
    }
  }

  return {
    title: extracted.title,
    shortDescription: extracted.shortDescription,
    fullDescription: extracted.fullDescription,
    images: extracted.images,
    rating: extracted.rating,
    reviewsCount: extracted.reviewsCount,
    categoryPath: extracted.categoryPath,
    categoryName: extracted.categoryName,
    pricing: {
      ...resolved.pricing,
      source: mode === "html" ? "html" : htmlSource,
    },
    debug: {
      candidates,
      extractionSteps: [...globalSteps, ...extracted.extractionSteps],
      rawSignals: {
        ...extracted.rawSignals,
        fetchUrl,
        mode,
      },
      chosenBlock: resolved.chosenBlock,
      chosenSignals: resolved.chosenSignals,
      usedCandidates: resolved.usedCandidates,
      ignoredCandidates: resolved.ignoredCandidates,
      discardReasons: resolved.discardReasons,
    },
  };
}
