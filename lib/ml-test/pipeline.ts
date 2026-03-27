import "server-only";

import type { ImportMode, TestMlImportResult } from "./types";
import { extractFromHtml } from "./extractFromHtml";
import { fetchMlHtml } from "./fetchHtml";
import { fetchHtmlWithPlaywright } from "./extractWithBrowser";
import { makeShortDescription, preferLongerText } from "./extractDescriptions";
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
  if (!fetched.ok) {
    throw new Error(fetched.error || `Falha ao baixar a página (${fetched.status ?? "?"})`);
  }
  globalSteps.push(
    `Fetch HTTP: ${fetched.html.length} chars${fetched.usedMobileFallback ? " (UA mobile)" : ""}`,
  );

  let extracted = extractFromHtml(fetched.html, "fetch-http");
  let resolved = resolvePreviewPricing(fetched.html, extracted.candidates, "html");
  let candidates = [...extracted.candidates];
  let htmlSource = resolved.pricing.source;

  if (mode === "auto" && isWeakResolved(resolved.pricing)) {
    globalSteps.push("Heurística fraca ou sem preço → tentando Playwright…");
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
      extracted = {
        ...extracted,
        title: mergedTitle,
        images: extracted.images.length ? extracted.images : headlessExtract.images,
        fullDescription: mergedFull,
        shortDescription: mergedShort.trim() || makeShortDescription(mergedFull, mergedTitle),
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
