import "server-only";

import { postgrestDelete, postgrestGet, postgrestPatch, postgrestPost, postgrestRpc } from "@/lib/postgrest/server";
import { normalizeProductTitleNorm } from "@/lib/product-title-norm";
import { adminUpsertCategoryFromBreadcrumb } from "@/lib/admin/categories";
import { fetchPricesFromUrl } from "@/lib/ml-price";
import { mlGetCategoryAuth } from "@/services/mercadolivre/auth-api";
import { mapMlNormalizedToDrafts } from "@/services/mercadolivre/mapper";
import type { NormalizedMlListing } from "@/services/mercadolivre/normalizer";

type ExistingMatch =
  | { kind: "none" }
  | { kind: "external_id"; product_id: string; external_row_id: string }
  | { kind: "permalink"; product_id: string; external_row_id: string }
  | { kind: "title_norm"; product_id: string };

function compareCode6(a: string, b: string): number {
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}

/**
 * Remove `product_external_listings` de **outros** produtos com o mesmo `external_permalink` ou `external_id`
 * (unique `(origin, external_permalink)` e `(origin, external_id)`). Assim o produto atual pode assumir o vínculo
 * sem 409 ao sincronizar (duplicata antiga no catálogo).
 */
export async function deleteConflictingExternalListingsForOtherProducts(opts: {
  keepProductId: string;
  origin: string;
  externalId: string;
  externalPermalink: string;
}) {
  const pid = String(opts.keepProductId);
  const origin = String(opts.origin || "mercadolivre");
  const eid = String(opts.externalId || "").trim().toUpperCase();
  const perm = String(opts.externalPermalink || "").trim();

  // Valores `eq.*` sem encodeURIComponent: buildUrl usa URLSearchParams, que já codifica uma vez
  // (encode antes gera %253A… e o DELETE não encontra a linha → 409 no INSERT).
  if (perm) {
    await postgrestDelete(
      "product_external_listings",
      {
        origin: `eq.${origin}`,
        external_permalink: `eq.${perm}`,
        product_id: `neq.${pid}`,
      },
      "service",
    );
  }
  if (eid) {
    await postgrestDelete(
      "product_external_listings",
      {
        origin: `eq.${origin}`,
        external_id: `eq.${eid}`,
        product_id: `neq.${pid}`,
      },
      "service",
    );
  }
}

/** Substitui o vínculo ML do produto (uma linha) para evitar conflito unique(product_id) ao mudar external_id. */
async function replaceProductExternalListing(productId: string, externalDraft: Record<string, unknown>) {
  const origin = String(externalDraft.origin ?? "mercadolivre");
  const eid = String(externalDraft.external_id ?? "");
  const perm = String(externalDraft.external_permalink ?? "");
  await deleteConflictingExternalListingsForOtherProducts({
    keepProductId: productId,
    origin,
    externalId: eid,
    externalPermalink: perm,
  });
  await postgrestDelete("product_external_listings", { product_id: `eq.${productId}` });
  await postgrestPost(
    "product_external_listings",
    { product_id: productId, ...externalDraft },
    "service",
    { returning: false },
  );
}

async function findExistingByTitleNorm(titleNorm: string, listingOrigin: string): Promise<ExistingMatch> {
  if (titleNorm.length < 2) return { kind: "none" };
  try {
    const rows = await postgrestGet<any[]>("products", {
      select: "id,code6",
      title_norm: `eq.${titleNorm}`,
      limit: "40",
    });
    const list = Array.isArray(rows) ? rows : [];
    if (!list.length) return { kind: "none" };

    let bestId: string | null = null;
    let bestCode6 = "";
    let bestHasMl = -1;

    for (const r of list) {
      const id = String(r.id ?? "");
      const code6 = String(r.code6 ?? "");
      if (!id) continue;
      const pel = await postgrestGet<any[]>("product_external_listings", {
        select: "id",
        product_id: `eq.${id}`,
        origin: `eq.${listingOrigin}`,
        limit: "1",
      });
      const hasMl = Array.isArray(pel) && pel[0] ? 1 : 0;
      if (
        bestId == null ||
        hasMl > bestHasMl ||
        (hasMl === bestHasMl && compareCode6(code6, bestCode6) < 0)
      ) {
        bestId = id;
        bestCode6 = code6;
        bestHasMl = hasMl;
      }
    }
    if (!bestId) return { kind: "none" };
    return { kind: "title_norm", product_id: bestId };
  } catch {
    /* coluna title_norm ausente até migrar, ou PostgREST */
    return { kind: "none" };
  }
}

async function findExistingByExternalId(origin: string, externalId: string): Promise<ExistingMatch> {
  const rows = await postgrestGet<any[]>("product_external_listings", {
    select: "id,product_id",
    origin: `eq.${origin}`,
    external_id: `eq.${externalId}`,
    limit: "1",
  });
  const row = Array.isArray(rows) ? rows[0] : null;
  return row?.product_id ? { kind: "external_id", product_id: row.product_id, external_row_id: row.id } : { kind: "none" };
}

async function findExistingByPermalink(origin: string, permalink: string): Promise<ExistingMatch> {
  const rows = await postgrestGet<any[]>("product_external_listings", {
    select: "id,product_id",
    origin: `eq.${origin}`,
    external_permalink: `eq.${permalink}`,
    limit: "1",
  });
  const row = Array.isArray(rows) ? rows[0] : null;
  return row?.product_id ? { kind: "permalink", product_id: row.product_id, external_row_id: row.id } : { kind: "none" };
}

export type MlImportResult =
  | { ok: true; action: "created"; product_id: string; code6: string; slug: string }
  | {
      ok: true;
      action: "already_exists";
      product_id: string;
      code6: string;
      slug: string;
      matchedBy: "external_id" | "permalink" | "title_norm";
    }
  | {
      ok: true;
      action: "updated_existing";
      product_id: string;
      code6: string;
      slug: string;
      matchedBy: "external_id" | "permalink" | "title_norm";
    };
  
export async function mlImportOrUpdateProduct(opts: {
  normalized: NormalizedMlListing;
  /** Se true, atualiza dados caso já exista. Se false, apenas reporta existente (não cria duplicata). */
  updateIfExists: boolean;
  /** Importação por HTML (PDP): breadcrumb lido na página */
  htmlCategoryPath?: string[];
  htmlCategoryName?: string | null;
  affiliateUrl?: string;
  sourceUrl?: string;
  affiliateCode?: string;
  descriptionShort?: string;
  descriptionDetail?: string;
}) : Promise<MlImportResult> {
  const n = opts.normalized;
  const listingOrigin = n.origin;
  const permalink =
    n.external_permalink ||
    (listingOrigin === "magazinevoce"
      ? `https://www.magazinevoce.com.br/p/${n.external_id}`
      : `https://www.mercadolivre.com.br/p/${n.external_id}`);

  // Dedup 1: external_id
  let match = await findExistingByExternalId(listingOrigin, n.external_id);
  // Dedup 2: permalink
  if (match.kind === "none") {
    match = await findExistingByPermalink(listingOrigin, permalink);
  }

  // Categoria externa (nome + breadcrumb) para mapear em categories internas
  let externalCategoryName: string | null = null;
  let externalCategoryPath: string[] = [];
  if (opts.htmlCategoryPath?.length || (opts.htmlCategoryName && opts.htmlCategoryName.trim())) {
    externalCategoryPath = opts.htmlCategoryPath ?? [];
    externalCategoryName = opts.htmlCategoryName?.trim() || null;
  } else if (n.external_category_id) {
    try {
      const cat = await mlGetCategoryAuth(n.external_category_id);
      externalCategoryName = cat.name ? String(cat.name).trim() : null;
      // Hierarquia completa ML: path_from_root = raiz → pai; o nome da folha vem em `name`.
      externalCategoryPath = Array.isArray(cat.path_from_root)
        ? cat.path_from_root.map((c) => (c?.name ? String(c.name).trim() : "")).filter(Boolean)
        : [];
    } catch (e) {
      console.warn("[mercadolivre] falha ao carregar categoria; continuando", e);
    }
  }

  // Fallback de preço (somente Mercado Livre — extractor específico ML).
  let fallbackPrice: { price: number; promo_price: number | null } | null = null;
  if (
    listingOrigin === "mercadolivre" &&
    (n.price_current == null || !Number.isFinite(n.price_current) || n.price_current <= 0)
  ) {
    try {
      const ml = await fetchPricesFromUrl(permalink);
      if (ml.kind === "ok") {
        fallbackPrice = { price: ml.price, promo_price: ml.promoPrice };
      }
    } catch (e) {
      console.warn("[mercadolivre] fallback de preço via HTML falhou", e);
    }
  }

  const { productDraft, externalDraft, suggestedSlugBase } = mapMlNormalizedToDrafts({
    normalized: n,
    externalCategoryName,
    externalCategoryPath,
    fallbackPrice,
    affiliateUrlOverride: opts.affiliateUrl,
    sourceUrlOverride: opts.sourceUrl,
    affiliateCodeOverride: opts.affiliateCode,
    descriptionShortOverride: opts.descriptionShort,
    descriptionDetailOverride: opts.descriptionDetail,
  });

  const internalCategoryId = await adminUpsertCategoryFromBreadcrumb(
    externalCategoryPath,
    externalCategoryName || externalCategoryPath[externalCategoryPath.length - 1] || "",
  );

  if (!internalCategoryId) {
    throw new Error("Não foi possível mapear/criar categoria interna para este anúncio.");
  }

  // Terceira trava: mesmo título normalizado (evita órfãos se listing falhou antes ou permalink divergiu).
  if (match.kind === "none") {
    const tn = normalizeProductTitleNorm(productDraft.title);
    if (tn.length >= 3) {
      const byTitle = await findExistingByTitleNorm(tn, listingOrigin);
      if (byTitle.kind === "title_norm") match = byTitle;
    }
  }

  if (match.kind !== "none") {
    if (!opts.updateIfExists) {
      // Por regra, não duplicar. (Na UI vamos oferecer “Atualizar”).
      const rows = await postgrestGet<any[]>("products", {
        select: "id,code6,slug",
        id: `eq.${match.product_id}`,
        limit: "1",
      });
      const p = Array.isArray(rows) ? rows[0] : null;
      if (!p) throw new Error("Produto existente não encontrado.");
      return {
        ok: true,
        action: "already_exists",
        product_id: p.id,
        code6: p.code6,
        slug: p.slug,
        matchedBy:
          match.kind === "external_id" ? "external_id" : match.kind === "permalink" ? "permalink" : "title_norm",
      };
    }

    // Atualiza snapshot + produto principal (mantém compatibilidade com o catálogo)
    await postgrestPatch(
      "products",
      {
        title: productDraft.title,
        description: productDraft.description,
        description_detail: productDraft.description_detail,
        images: productDraft.images,
        category_id: internalCategoryId,
        price: productDraft.price,
        promo_price: productDraft.promo_price,
        is_offer: productDraft.is_offer,
        off_percent: productDraft.off_percent,
        rating: productDraft.rating,
        reviews_count: productDraft.reviews_count,
        affiliate_url: productDraft.affiliate_url,
        source_url: productDraft.source_url,
        last_seen_at: productDraft.last_seen_at,
        is_active: productDraft.is_active,
      },
      { id: `eq.${match.product_id}` },
    );

    // Troca de MLB na URL: unique(product_id) impede dois listings; substitui a linha inteira.
    await replaceProductExternalListing(match.product_id, externalDraft as Record<string, unknown>);

    const rows = await postgrestGet<any[]>("products", {
      select: "id,code6,slug",
      id: `eq.${match.product_id}`,
      limit: "1",
    });
    const p = Array.isArray(rows) ? rows[0] : null;
    if (!p) throw new Error("Produto atualizado não encontrado.");

    return {
      ok: true,
      action: "updated_existing",
      product_id: p.id,
      code6: p.code6,
      slug: p.slug,
      matchedBy:
        match.kind === "external_id" ? "external_id" : match.kind === "permalink" ? "permalink" : "title_norm",
    };
  }

  // Criar produto interno novo
  const code6 = await postgrestRpc<string>("next_product_code6", {});
  if (typeof code6 !== "string" || code6.length !== 6) {
    throw new Error("Falha ao gerar code6.");
  }
  const slug = `${suggestedSlugBase}-${code6}`;

  const inserted = await postgrestPost<any[]>(
    "products",
    {
      code6,
      slug,
      title: productDraft.title,
      description: productDraft.description,
      description_detail: productDraft.description_detail,
      images: productDraft.images,
      category_id: internalCategoryId,
      price: productDraft.price,
      promo_price: productDraft.promo_price,
      is_offer: productDraft.is_offer,
        off_percent: productDraft.off_percent,
        rating: productDraft.rating,
        reviews_count: productDraft.reviews_count,
        affiliate_code: productDraft.affiliate_code,
      affiliate_url: productDraft.affiliate_url,
      source_url: productDraft.source_url,
      last_seen_at: productDraft.last_seen_at,
      is_active: productDraft.is_active,
    },
    "service",
    { select: "id,code6,slug", returning: true },
  );
  const p = Array.isArray(inserted) ? inserted[0] : null;
  if (!p?.id) throw new Error("Falha ao salvar produto.");

  try {
    await deleteConflictingExternalListingsForOtherProducts({
      keepProductId: p.id,
      origin: String((externalDraft as { origin?: string }).origin ?? "mercadolivre"),
      externalId: String((externalDraft as { external_id?: string }).external_id ?? ""),
      externalPermalink: String((externalDraft as { external_permalink?: string }).external_permalink ?? ""),
    });
    await postgrestPost(
      "product_external_listings",
      {
        product_id: p.id,
        ...externalDraft,
      },
      "service",
      { returning: false },
    );
  } catch (e) {
    // Órfão sem listing → próxima importação não acha external_id e duplicava o catálogo.
    console.error("[mercadolivre] falha ao salvar product_external_listings; revertendo produto", e);
    try {
      await postgrestDelete("products", { id: `eq.${p.id}` });
    } catch (delErr) {
      console.error("[mercadolivre] falha ao remover produto órfão", delErr);
    }
    throw e instanceof Error ? e : new Error("Falha ao vincular anúncio externo ao produto.");
  }

  return { ok: true, action: "created", product_id: p.id, code6: p.code6, slug: p.slug };
}

