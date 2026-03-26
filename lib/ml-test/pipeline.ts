import "server-only";

import type { ImportMode, TestMlImportResult } from "./types";
import { chooseBestPrices, type ChosenPricing } from "./chooseBestPrices";
import { extractFromHtml } from "./extractFromHtml";
import { fetchMlHtml } from "./fetchHtml";
import { fetchHtmlWithPlaywright } from "./extractWithBrowser";
import { isMercadoLivreProductUrl, normalizeMlFetchUrl } from "./normalize";

function scorePricing(p: ChosenPricing): number {
  let s = 0;
  if (p.currentPrice != null) s += 4;
  if (p.originalPrice != null) s += 2;
  if (p.confidence === "high") s += 3;
  else if (p.confidence === "medium") s += 2;
  else s += 1;
  return s;
}

function mergePricing(a: ChosenPricing, b: ChosenPricing): ChosenPricing {
  if (b.currentPrice == null && a.currentPrice != null) return { ...a, source: "mixed" };
  if (a.currentPrice == null && b.currentPrice != null) return { ...b, source: "mixed" };
  if (scorePricing(b) > scorePricing(a)) return { ...b, source: "mixed" };
  return { ...a, source: "mixed" };
}

function isWeak(pricing: ChosenPricing): boolean {
  return pricing.currentPrice == null || pricing.confidence === "low";
}

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
    const pricing = chooseBestPrices(extracted.candidates, "headless");
    return {
      title: extracted.title,
      shortDescription: extracted.shortDescription,
      fullDescription: extracted.fullDescription,
      images: extracted.images,
      pricing: {
        currentPrice: pricing.currentPrice,
        originalPrice: pricing.originalPrice,
        discountPercent: pricing.discountPercent,
        installmentPrice: pricing.installmentPrice,
        installments: pricing.installments,
        confidence: pricing.confidence,
        source: "headless",
      },
      debug: {
        candidates: extracted.candidates,
        extractionSteps: [...globalSteps, ...extracted.extractionSteps],
        rawSignals: { ...extracted.rawSignals, fetchUrl, layer: "headless" },
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
  let pricing = chooseBestPrices(extracted.candidates, "html");
  let candidates = [...extracted.candidates];
  let htmlSource: TestMlImportResult["pricing"]["source"] = "html";

  if (mode === "auto" && isWeak(pricing)) {
    globalSteps.push("Heurística fraca ou sem preço → tentando Playwright…");
    const pw = await fetchHtmlWithPlaywright(fetchUrl);
    if (pw.ok) {
      globalSteps.push(`Playwright: ${pw.html.length} chars`);
      const headlessExtract = extractFromHtml(pw.html, "headless");
      const pricingH = chooseBestPrices(headlessExtract.candidates, "headless");
      pricing = mergePricing(pricing, pricingH);
      candidates = [...candidates, ...headlessExtract.candidates];
      extracted = {
        ...extracted,
        title: headlessExtract.title || extracted.title,
        images: extracted.images.length ? extracted.images : headlessExtract.images,
        fullDescription: extracted.fullDescription || headlessExtract.fullDescription,
        shortDescription: extracted.shortDescription || headlessExtract.shortDescription,
      };
      globalSteps.push(...headlessExtract.extractionSteps);
      htmlSource = pricing.source;
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
      currentPrice: pricing.currentPrice,
      originalPrice: pricing.originalPrice,
      discountPercent: pricing.discountPercent,
      installmentPrice: pricing.installmentPrice,
      installments: pricing.installments,
      confidence: pricing.confidence,
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
    },
  };
}
