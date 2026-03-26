import "server-only";

import { postgrestGet, postgrestPatch, postgrestPost, postgrestRpc } from "@/lib/postgrest/server";
import { adminUpsertCategoryFromBreadcrumb } from "@/lib/admin/categories";
import { fetchPricesFromUrl } from "@/lib/ml-price";
import { mlGetCategoryAuth } from "@/services/mercadolivre/auth-api";
import { mapMlNormalizedToDrafts } from "@/services/mercadolivre/mapper";
import type { NormalizedMlListing } from "@/services/mercadolivre/normalizer";

type ExistingMatch =
  | { kind: "none" }
  | { kind: "external_id"; product_id: string; external_row_id: string }
  | { kind: "permalink"; product_id: string; external_row_id: string };

async function findExistingByExternalId(externalId: string): Promise<ExistingMatch> {
  const rows = await postgrestGet<any[]>("product_external_listings", {
    select: "id,product_id",
    origin: "eq.mercadolivre",
    external_id: `eq.${encodeURIComponent(externalId)}`,
    limit: "1",
  });
  const row = Array.isArray(rows) ? rows[0] : null;
  return row?.product_id ? { kind: "external_id", product_id: row.product_id, external_row_id: row.id } : { kind: "none" };
}

async function findExistingByPermalink(permalink: string): Promise<ExistingMatch> {
  const rows = await postgrestGet<any[]>("product_external_listings", {
    select: "id,product_id",
    origin: "eq.mercadolivre",
    external_permalink: `eq.${encodeURIComponent(permalink)}`,
    limit: "1",
  });
  const row = Array.isArray(rows) ? rows[0] : null;
  return row?.product_id ? { kind: "permalink", product_id: row.product_id, external_row_id: row.id } : { kind: "none" };
}

export type MlImportResult =
  | { ok: true; action: "created"; product_id: string; code6: string; slug: string }
  | { ok: true; action: "already_exists"; product_id: string; code6: string; slug: string; matchedBy: "external_id" | "permalink" }
  | { ok: true; action: "updated_existing"; product_id: string; code6: string; slug: string; matchedBy: "external_id" | "permalink" };
  
export async function mlImportOrUpdateProduct(opts: {
  normalized: NormalizedMlListing;
  /** Se true, atualiza dados caso já exista. Se false, apenas reporta existente (não cria duplicata). */
  updateIfExists: boolean;
}) : Promise<MlImportResult> {
  const n = opts.normalized;
  const permalink = n.external_permalink || `https://www.mercadolivre.com.br/p/${n.external_id}`;

  // Dedup 1: external_id
  let match = await findExistingByExternalId(n.external_id);
  // Dedup 2: permalink
  if (match.kind === "none") {
    match = await findExistingByPermalink(permalink);
  }

  // Categoria externa (nome + breadcrumb) para mapear em categories internas
  let externalCategoryName: string | null = null;
  let externalCategoryPath: string[] = [];
  if (n.external_category_id) {
    try {
      const cat = await mlGetCategoryAuth(n.external_category_id);
      externalCategoryName = (cat.name ?? null) ? String(cat.name) : null;
      externalCategoryPath = Array.isArray(cat.path_from_root)
        ? cat.path_from_root.map((c) => c.name).filter(Boolean)
        : [];
    } catch (e) {
      console.warn("[mercadolivre] falha ao carregar categoria; continuando", e);
    }
  }

  // Fallback de preço: se API vier incompleta, tentamos HTML (mesma técnica do sync).
  let fallbackPrice: { price: number; promo_price: number | null } | null = null;
  if (n.price_current == null || !Number.isFinite(n.price_current) || n.price_current <= 0) {
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
  });

  const internalCategoryId = await adminUpsertCategoryFromBreadcrumb(
    externalCategoryPath,
    externalCategoryName || externalCategoryPath[externalCategoryPath.length - 1] || "",
  );

  if (!internalCategoryId) {
    throw new Error("Não foi possível mapear/criar categoria interna para este anúncio.");
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
        matchedBy: match.kind === "external_id" ? "external_id" : "permalink",
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
        affiliate_url: productDraft.affiliate_url,
        source_url: productDraft.source_url,
        last_seen_at: productDraft.last_seen_at,
        is_active: productDraft.is_active,
      },
      { id: `eq.${match.product_id}` },
    );

    await postgrestPost(
      "product_external_listings",
      {
        product_id: match.product_id,
        ...externalDraft,
      },
      "service",
      { upsert: true, onConflict: "origin,external_id", returning: false },
    );

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
      matchedBy: match.kind === "external_id" ? "external_id" : "permalink",
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
      rating: null,
      reviews_count: null,
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
    // Se falhar a parte externa, não queremos perder o produto; mas precisamos sinalizar.
    console.error("[mercadolivre] falha ao salvar product_external_listings", e);
  }

  return { ok: true, action: "created", product_id: p.id, code6: p.code6, slug: p.slug };
}

