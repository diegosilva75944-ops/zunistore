import "server-only";

import type { ImportMode, TestMlImportResult } from "./types";
import { extractFromHtml } from "./extractFromHtml";
import { fetchMlHtml } from "./fetchHtml";
import { fetchHtmlWithPlaywright } from "./extractWithBrowser";
import { makeShortDescription, preferLongerText } from "./extractDescriptions";
import { preferMaxNullable } from "./extractReviews";
import { isMercadoLivreProductUrl, normalizeMlFetchUrl } from "./normalize";
import { isWeakResolved, mergeResolvedDisplay, resolvePreviewPricing } from "./resolvePreviewPricing";
import { fetchMlItemApi } from "./fetchMlItemApi";
import { mlGetItemAuth, mlResolveProductToItemAuth } from "@/services/mercadolivre/auth-api";

function tryExtractMlbIdFromAnyUrl(...urls: Array<string | null | undefined>): string | null {
  const joined = urls
    .filter((u): u is string => typeof u === "string" && u.length > 0)
    .join(" ");

  /** MLB123... */
  const m1 = joined.match(/\b(MLB\d{6,})\b/i);
  if (m1?.[1]) return m1[1].toUpperCase();

  /** MLB-123... (produto.mercadolivre.com.br/MLB-123...) */
  const m2 = joined.match(/\bMLB-(\d{6,})\b/i);
  if (m2?.[1]) return `MLB${m2[1]}`;

  return null;
}

function tryExtractCatalogProductIdFromUrl(u: string): string | null {
  const m = String(u || "").match(/\/p\/(MLB\d{6,})\b/i);
  return m?.[1] ? m[1].toUpperCase() : null;
}

async function tryFetchViaMlAuth(fetchUrl: string, rawUrl: string, hint: string) {
  const catalogProductId = tryExtractCatalogProductIdFromUrl(fetchUrl) ?? tryExtractCatalogProductIdFromUrl(rawUrl);
  const anyId = tryExtractMlbIdFromAnyUrl(rawUrl, fetchUrl);

  try {
    if (catalogProductId) {
      const resolvedItemId = await mlResolveProductToItemAuth(catalogProductId);
      if (resolvedItemId) {
        const item = await mlGetItemAuth(resolvedItemId);
        const pics = Array.isArray(item.pictures) ? item.pictures : [];
        const pictures = pics
          .map((p) => (p?.secure_url || p?.url ? String(p.secure_url ?? p.url) : null))
          .filter((x): x is string => typeof x === "string" && x.startsWith("http"));
        return {
          ok: true as const,
          mode: "catalog" as const,
          hint,
          productId: catalogProductId,
          itemId: resolvedItemId,
          title: item.title ?? null,
          price: typeof item.price === "number" && item.price > 0 ? item.price : null,
          originalPrice:
            typeof item.original_price === "number" && item.original_price > 0 ? item.original_price : null,
          pictures,
          permalink: item.permalink ?? null,
        };
      }
    }

    if (anyId) {
      const item = await mlGetItemAuth(anyId);
      const pics = Array.isArray(item.pictures) ? item.pictures : [];
      const pictures = pics
        .map((p) => (p?.secure_url || p?.url ? String(p.secure_url ?? p.url) : null))
        .filter((x): x is string => typeof x === "string" && x.startsWith("http"));
      return {
        ok: true as const,
        mode: "item" as const,
        hint,
        itemId: anyId,
        title: item.title ?? null,
        price: typeof item.price === "number" && item.price > 0 ? item.price : null,
        originalPrice:
          typeof item.original_price === "number" && item.original_price > 0 ? item.original_price : null,
        pictures,
        permalink: item.permalink ?? null,
      };
    }

    return { ok: false as const, error: "Sem ID MLB para consulta auth." };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false as const, error: `API auth: ${msg}` };
  }
}

export async function runTestMlImport(
  rawUrl: string,
  mode: ImportMode,
  opts?: { returnPartialOnBlock?: boolean },
): Promise<TestMlImportResult> {
  if (!isMercadoLivreProductUrl(rawUrl)) {
    throw new Error("Informe uma URL do Mercado Livre (mercadolivre.com.br/… ou meli.la/…).");
  }

  const fetchUrl = normalizeMlFetchUrl(rawUrl, { keepSearch: true });
  const globalSteps: string[] = [`URL normalizada: ${fetchUrl}`, `Modo: ${mode}`];
  const returnPartialOnBlock = Boolean(opts?.returnPartialOnBlock);

  const blockedResult = (why: string, extra?: Record<string, unknown>): TestMlImportResult => ({
    title: null,
    shortDescription: "",
    fullDescription: "",
    images: [],
    rating: null,
    reviewsCount: null,
    categoryPath: [],
    categoryName: "",
    pricing: {
      currentPrice: null,
      originalPrice: null,
      discountPercent: null,
      hasDiscount: false,
      displayMode: "unknown",
      installmentPrice: null,
      installments: null,
      confidence: "low",
      source: "mixed",
    },
    debug: {
      candidates: [],
      extractionSteps: [...globalSteps, why],
      rawSignals: { fetchUrl, mode, ...(extra ?? {}) },
      chosenBlock: null,
      chosenSignals: {},
      usedCandidates: [],
      ignoredCandidates: [],
      discardReasons: [why],
    },
  });

  if (mode === "headless") {
    const pw = await fetchHtmlWithPlaywright(fetchUrl);
    if (!pw.ok) {
      /** Preferir API oficial (OAuth) quando scraping está bloqueado. */
      const auth = await tryFetchViaMlAuth(fetchUrl, rawUrl, "Playwright bloqueado (headless)");
      if (auth.ok && auth.title && auth.price) {
        globalSteps.push(`Playwright bloqueado (${pw.error}). Usando API auth (${auth.itemId})…`);
        return {
          title: auth.title,
          shortDescription: "",
          fullDescription: "",
          images: auth.pictures,
          rating: null,
          reviewsCount: null,
          categoryPath: [],
          categoryName: "",
          pricing: {
            currentPrice: auth.price,
            originalPrice:
              auth.originalPrice && auth.originalPrice > auth.price ? auth.originalPrice : null,
            discountPercent:
              auth.originalPrice && auth.originalPrice > auth.price ?
                Math.round((1 - auth.price / auth.originalPrice) * 100)
              : null,
            hasDiscount: Boolean(auth.originalPrice && auth.originalPrice > auth.price),
            displayMode:
              auth.originalPrice && auth.originalPrice > auth.price ? "discounted_price" : "single_price",
            installmentPrice: null,
            installments: null,
            confidence: "low",
            source: "mixed",
          },
          debug: {
            candidates: [],
            extractionSteps: [...globalSteps],
            rawSignals: {
              fetchUrl,
              layer: "headless",
              api: {
                auth: true,
                mode: auth.mode,
                itemId: auth.itemId,
                productId: (auth as any).productId ?? null,
                permalink: auth.permalink,
              },
            },
            chosenBlock: null,
            chosenSignals: {},
            usedCandidates: [],
            ignoredCandidates: [],
            discardReasons: ["Fallback API auth (headless bloqueado)"],
          },
        };
      }
      if (!auth.ok) {
        globalSteps.push(`API auth falhou (${auth.error}) — tentando API pública items…`);
      } else {
        globalSteps.push(
          `API auth sem dados suficientes (title=${Boolean(auth.title)}, price=${Boolean(auth.price)}) — tentando API pública items…`,
        );
      }

      /** Último recurso: API pública do item quando o ML bloqueia headless. */
      const id = tryExtractMlbIdFromAnyUrl(rawUrl, fetchUrl, pw.error);
      if (id) {
        const api = await fetchMlItemApi(id);
        if (api.ok && api.title && api.price) {
          globalSteps.push(`Playwright bloqueado (${pw.error}). Usando API items (${api.id})…`);
          return {
            title: api.title,
            shortDescription: "",
            fullDescription: "",
            images: api.pictures,
            rating: null,
            reviewsCount: null,
            categoryPath: [],
            categoryName: "",
            pricing: {
              currentPrice: api.price,
              originalPrice: api.originalPrice && api.originalPrice > api.price ? api.originalPrice : null,
              discountPercent:
                api.originalPrice && api.originalPrice > api.price ?
                  Math.round((1 - api.price / api.originalPrice) * 100)
                : null,
              hasDiscount: Boolean(api.originalPrice && api.originalPrice > api.price),
              displayMode: api.originalPrice && api.originalPrice > api.price ? "discounted_price" : "single_price",
              installmentPrice: null,
              installments: null,
              confidence: "low",
              source: "mixed",
            },
            debug: {
              candidates: [],
              extractionSteps: [...globalSteps],
              rawSignals: { fetchUrl, layer: "headless", api: { id: api.id, permalink: api.permalink } },
              chosenBlock: null,
              chosenSignals: {},
              usedCandidates: [],
              ignoredCandidates: [],
              discardReasons: ["Fallback API items (headless bloqueado)"],
            },
          };
        }
        if (returnPartialOnBlock) {
          return blockedResult(
            `Bloqueado no headless: ${pw.error} (API auth: ${auth.ok ? "sem dados" : auth.error}; API items falhou: ${api.ok ? "sem dados" : api.error})`,
            {
              layer: "headless",
              apiTried: { id },
              authTried: { ok: auth.ok, error: auth.ok ? null : auth.error },
            },
          );
        }
      }
      if (returnPartialOnBlock) {
        return blockedResult(`Bloqueado no headless: ${pw.error} (API auth: ${auth.ok ? "sem dados" : auth.error})`, {
          layer: "headless",
          authTried: { ok: auth.ok, error: auth.ok ? null : auth.error },
        });
      }
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
        /** Preferir API oficial (OAuth) quando scraping está bloqueado. */
        const auth = await tryFetchViaMlAuth(fetchUrl, rawUrl, "Playwright bloqueado (auto)");
        if (auth.ok && auth.title && auth.price) {
          globalSteps.push(`Playwright bloqueado (${pw.error}). Usando API auth (${auth.itemId})…`);
          return {
            title: auth.title,
            shortDescription: "",
            fullDescription: "",
            images: auth.pictures,
            rating: null,
            reviewsCount: null,
            categoryPath: [],
            categoryName: "",
            pricing: {
              currentPrice: auth.price,
              originalPrice:
                auth.originalPrice && auth.originalPrice > auth.price ? auth.originalPrice : null,
              discountPercent:
                auth.originalPrice && auth.originalPrice > auth.price ?
                  Math.round((1 - auth.price / auth.originalPrice) * 100)
                : null,
              hasDiscount: Boolean(auth.originalPrice && auth.originalPrice > auth.price),
              displayMode:
                auth.originalPrice && auth.originalPrice > auth.price ? "discounted_price" : "single_price",
              installmentPrice: null,
              installments: null,
              confidence: "low",
              source: "mixed",
            },
            debug: {
              candidates: [],
              extractionSteps: [...globalSteps],
              rawSignals: {
                fetchUrl,
                layer: "headless",
                api: {
                  auth: true,
                  mode: auth.mode,
                  itemId: auth.itemId,
                  productId: (auth as any).productId ?? null,
                  permalink: auth.permalink,
                },
              },
              chosenBlock: null,
              chosenSignals: {},
              usedCandidates: [],
              ignoredCandidates: [],
              discardReasons: ["Fallback API auth (HTTP e headless bloqueados)"],
            },
          };
        }
        if (!auth.ok) {
          globalSteps.push(`API auth falhou (${auth.error}) — tentando API pública items…`);
        } else {
          globalSteps.push(
            `API auth sem dados suficientes (title=${Boolean(auth.title)}, price=${Boolean(auth.price)}) — tentando API pública items…`,
          );
        }

        const id = tryExtractMlbIdFromAnyUrl(rawUrl, fetchUrl, pw.error);
        if (id) {
          const api = await fetchMlItemApi(id);
          if (api.ok && api.title && api.price) {
            globalSteps.push(`Playwright bloqueado (${pw.error}). Usando API items (${api.id})…`);
            return {
              title: api.title,
              shortDescription: "",
              fullDescription: "",
              images: api.pictures,
              rating: null,
              reviewsCount: null,
              categoryPath: [],
              categoryName: "",
              pricing: {
                currentPrice: api.price,
                originalPrice: api.originalPrice && api.originalPrice > api.price ? api.originalPrice : null,
                discountPercent:
                  api.originalPrice && api.originalPrice > api.price ?
                    Math.round((1 - api.price / api.originalPrice) * 100)
                  : null,
                hasDiscount: Boolean(api.originalPrice && api.originalPrice > api.price),
                displayMode: api.originalPrice && api.originalPrice > api.price ? "discounted_price" : "single_price",
                installmentPrice: null,
                installments: null,
                confidence: "low",
                source: "mixed",
              },
              debug: {
                candidates: [],
                extractionSteps: [...globalSteps],
                rawSignals: { fetchUrl, layer: "headless", api: { id: api.id, permalink: api.permalink } },
                chosenBlock: null,
                chosenSignals: {},
                usedCandidates: [],
                ignoredCandidates: [],
                discardReasons: ["Fallback API items (HTTP e headless bloqueados)"],
              },
            };
          }
          if (returnPartialOnBlock) {
            return blockedResult(
              `Bloqueado no fetch+headless: ${pw.error} (API auth: ${auth.ok ? "sem dados" : auth.error}; API items falhou: ${api.ok ? "sem dados" : api.error})`,
              {
                layer: "headless",
                apiTried: { id },
                authTried: { ok: auth.ok, error: auth.ok ? null : auth.error },
              },
            );
          }
        }
        if (returnPartialOnBlock) {
          return blockedResult(
            `Bloqueado no fetch+headless: ${pw.error} (API auth: ${auth.ok ? "sem dados" : auth.error})`,
            { layer: "headless", authTried: { ok: auth.ok, error: auth.ok ? null : auth.error } },
          );
        }
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

  const t = extracted.title?.trim() ?? "";
  const missingTitle = !t;
  /** PDP de login/erro costuma expor só og:title “Mercado Livre” — forçar Playwright no modo auto. */
  const genericSiteTitle = /^mercado\s+livre$/i.test(t);
  if (
    mode === "auto" &&
    !usedPlaywrightFirst &&
    (isWeakResolved(resolved.pricing) || missingTitle || genericSiteTitle)
  ) {
    globalSteps.push(
      genericSiteTitle && !missingTitle ?
        "Título genérico (possível bloqueio) → tentando Playwright…"
      : missingTitle && !isWeakResolved(resolved.pricing) ?
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
