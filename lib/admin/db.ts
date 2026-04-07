import "server-only";

import {
  postgrestGet,
  postgrestPost,
  postgrestPatch,
  postgrestDelete,
  postgrestGetWithCount,
  postgrestRpc,
  PostgrestError,
  inVal,
} from "@/lib/postgrest/server";

/** Banco sem migração `show_in_header` — PostgREST PGRST204. */
function isMissingShowInHeaderColumn(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("PGRST204") && msg.includes("show_in_header");
}
import { randomToken, sha256Hex } from "@/lib/crypto";
import { slugify } from "@/lib/slug";
import { ilikeContainsPattern } from "@/lib/postgrest/ilike";
import { checkAffiliatePageContainsProduct } from "@/lib/affiliate-validate";
import { collectDescendantCategoryIds } from "@/lib/categories-tree";

function enc(v: string | number | boolean): string {
  return encodeURIComponent(String(v));
}

export async function adminListCategories() {
  try {
    const data = await postgrestGet<any[]>("categories", {
      select: "id,name,slug,parent_id,is_seed,show_in_header,created_at",
      order: "name.asc",
    });
    return Array.isArray(data) ? data : [];
  } catch (err) {
    if (!isMissingShowInHeaderColumn(err)) throw err;
    const data = await postgrestGet<any[]>("categories", {
      select: "id,name,slug,parent_id,is_seed,created_at",
      order: "name.asc",
    });
    const rows = Array.isArray(data) ? data : [];
    return rows.map((r: any) => ({ ...r, show_in_header: false }));
  }
}

/** Contagem de produtos ativos por `category_id` (para admin / categorias). */
export async function adminCategoryProductCounts(): Promise<Record<string, number>> {
  const parseCount = (raw: unknown): number => {
    if (raw === undefined || raw === null) return 0;
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;
    const n = parseInt(String(raw), 10);
    return Number.isFinite(n) ? n : 0;
  };

  const rowsToMap = (rows: { category_id?: string | null; count?: unknown }[]): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const r of rows) {
      const cid = r?.category_id;
      if (cid == null || cid === "") continue;
      out[String(cid)] = parseCount(r.count);
    }
    return out;
  };

  try {
    const rows = await postgrestGet<any[]>("products", {
      select: "category_id,count()",
      group: "category_id",
    });
    return rowsToMap(Array.isArray(rows) ? rows : []);
  } catch (e) {
    console.warn("[adminCategoryProductCounts] aggregate falhou, usando paginação", e);
  }

  const out: Record<string, number> = {};
  let offset = 0;
  const pageSize = 1000;
  for (;;) {
    const batch = await postgrestGet<{ category_id: string | null }[]>("products", {
      select: "category_id",
      limit: String(pageSize),
      offset: String(offset),
    });
    const rows = Array.isArray(batch) ? batch : [];
    if (rows.length === 0) break;
    for (const r of rows) {
      if (r.category_id == null) continue;
      const id = String(r.category_id);
      out[id] = (out[id] ?? 0) + 1;
    }
    if (rows.length < pageSize) break;
    offset += pageSize;
  }
  return out;
}

export async function adminCreateCategory(input: {
  name: string;
  slug?: string | null;
  parent_id?: string | null;
  show_in_header?: boolean;
}) {
  const slug = (input.slug?.trim() ? slugify(input.slug) : slugify(input.name)) || "categoria";
  const existing = await postgrestGet<any[]>("categories", {
    select: "id",
    slug: `eq.${enc(slug)}`,
    limit: "1",
  });
  if (Array.isArray(existing) && existing.length > 0) {
    throw new Error("Já existe uma categoria com este slug.");
  }
  const inserted = await postgrestPost<any[]>(
    "categories",
    {
      name: input.name.trim(),
      slug,
      parent_id: input.parent_id ?? null,
      is_seed: false,
    },
    "service",
    { select: "id,name,slug,parent_id,is_seed", returning: true },
  );
  const arr = Array.isArray(inserted) ? inserted : [];
  if (!arr[0]) throw new Error("Falha ao criar categoria.");
  const row = arr[0] as any;

  if (input.show_in_header) {
    try {
      await postgrestPatch("categories", { show_in_header: true }, { id: `eq.${row.id}` });
      return { ...row, show_in_header: true };
    } catch (err) {
      if (!isMissingShowInHeaderColumn(err)) throw err;
    }
  }
  return { ...row, show_in_header: false };
}

export async function adminUpdateCategory(
  id: string,
  input: { name?: string; slug?: string; show_in_header?: boolean; parent_id?: string | null },
) {
  if (input.parent_id !== undefined) {
    const selfRows = await postgrestGet<any[]>("categories", {
      select: "id,is_seed",
      id: `eq.${id}`,
      limit: "1",
    });
    const self = Array.isArray(selfRows) ? selfRows[0] : null;
    if (self?.is_seed) {
      throw new Error("Categorias seed não podem ter o pai alterado.");
    }
    const newPid =
      input.parent_id === null || input.parent_id === ""
        ? null
        : String(input.parent_id).trim() || null;
    if (newPid === id) {
      throw new Error("Uma categoria não pode ser pai dela mesma.");
    }
    if (newPid) {
      const all = await adminListCategories();
      const flat = (Array.isArray(all) ? all : []).map((c: any) => ({
        id: String(c.id),
        parent_id: c.parent_id == null ? null : String(c.parent_id),
      }));
      const desc = new Set(collectDescendantCategoryIds(id, flat));
      if (desc.has(newPid)) {
        throw new Error("Não é possível mover para dentro da própria subárvore.");
      }
    }
  }

  const updates: Record<string, unknown> = {};
  if (input.name !== undefined) updates.name = input.name.trim();
  if (input.slug !== undefined) {
    const raw = input.slug.trim();
    const slug = raw ? slugify(raw) : slugify((input.name as string) || "");
    if (slug) updates.slug = slug;
  }
  if (input.show_in_header !== undefined) updates.show_in_header = input.show_in_header;
  if (input.parent_id !== undefined) {
    updates.parent_id =
      input.parent_id === null || input.parent_id === "" ? null : String(input.parent_id).trim();
  }
  if (Object.keys(updates).length === 0) return;
  try {
    await postgrestPatch("categories", updates, { id: `eq.${id}` });
  } catch (err) {
    if (!isMissingShowInHeaderColumn(err)) throw err;
    const { show_in_header: _drop, ...rest } = updates as Record<string, unknown>;
    if (Object.keys(rest).length === 0) return;
    await postgrestPatch("categories", rest, { id: `eq.${id}` });
  }
}

export async function adminDeleteCategory(id: string) {
  const { count } = await postgrestGetWithCount<unknown[]>("products", {
    select: "id",
    category_id: `eq.${id}`,
    limit: "1",
  });
  if (count > 0) {
    throw new Error("Não é possível excluir: existem produtos nesta categoria.");
  }
  await postgrestDelete("categories", { id: `eq.${id}` });
}

export async function adminBulkDeleteCategories(ids: string[]): Promise<{
  deleted: string[];
  failed: { id: string; error: string }[];
}> {
  const unique = [...new Set(ids.map((x) => String(x).trim()).filter(Boolean))];
  if (unique.length === 0) return { deleted: [], failed: [] };

  const allCats = await adminListCategories();
  const byId = Object.fromEntries((Array.isArray(allCats) ? allCats : []).map((c: any) => [c.id, c]));
  const seedIds = new Set(
    (Array.isArray(allCats) ? allCats : []).filter((c: any) => c.is_seed).map((c: any) => c.id),
  );

  const deleted: string[] = [];
  const failed: { id: string; error: string }[] = [];

  for (const id of unique) {
    if (!byId[id]) {
      failed.push({ id, error: "Categoria não encontrada." });
      continue;
    }
    if (seedIds.has(id)) {
      failed.push({ id, error: "Categorias seed não podem ser excluídas." });
      continue;
    }
    try {
      await adminDeleteCategory(id);
      deleted.push(id);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Falha ao excluir.";
      failed.push({ id, error: msg });
    }
  }

  return { deleted, failed };
}

export const AFFILIATE_VALID_PARAM = "matt_tool=40141155";

/** Registros no histórico com link expirado (aguardam novo link ou exclusão). */
export async function adminCountExpiredAffiliateProducts(): Promise<number> {
  try {
    const { count } = await postgrestGetWithCount<unknown[]>("deleted_products_history", {
      select: "id",
      reason: "eq.affiliate_expired",
      limit: "1",
    });
    return count ?? 0;
  } catch {
    return 0;
  }
}

/** Prioriza IDs (ex.: `affiliate_valid = false` ainda em `products`), depois a fila geral, sem duplicar. */
export function mergeProductIdsForAffiliateValidation(
  prioritizedIds: string[],
  fallbackRows: { id?: string | null }[],
  limit: number,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of prioritizedIds) {
    if (!id || out.length >= limit) continue;
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  const rows = Array.isArray(fallbackRows) ? fallbackRows : [];
  for (const row of rows) {
    const id = row?.id;
    if (!id || out.length >= limit) continue;
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

/** Próximo lote de IDs para validação de links (mesma lógica da rota `validate-affiliate-links`). */
export async function pickAffiliateValidationProductIds(limit: number): Promise<string[]> {
  const cap = Math.min(50, Math.max(1, limit));
  let expiredRows: { id: string }[] = [];
  try {
    /** Só catálogo ativo: inativos/deletados do site não devem entrar na fila (evita HTTP longo na sync ML). */
    expiredRows = await postgrestGet<{ id: string }[]>("products", {
      select: "id",
      affiliate_valid: "eq.false",
      is_active: "eq.true",
      limit: String(cap),
    });
  } catch (e) {
    console.warn("[admin] pickAffiliateValidationProductIds affiliate_valid=false ignorada", e);
  }
  const expiredIds = (Array.isArray(expiredRows) ? expiredRows : []).map((r) => r.id).filter(Boolean);
  const need = Math.max(0, cap - expiredIds.length);

  let queueRows: { id: string }[] = [];
  if (need > 0) {
    try {
      queueRows = await postgrestGet<{ id: string }[]>("products", {
        select: "id",
        is_active: "eq.true",
        order: "affiliate_valid_checked_at.asc.nullsfirst",
        limit: String(Math.min(need * 4, 100)),
      });
    } catch (e) {
      console.warn("[admin] pickAffiliateValidationProductIds order falhou, usando created_at", e);
      queueRows = await postgrestGet<{ id: string }[]>("products", {
        select: "id",
        is_active: "eq.true",
        order: "created_at.desc",
        limit: String(Math.min(need * 4, 100)),
      });
    }
  }

  return mergeProductIdsForAffiliateValidation(expiredIds, queueRows, cap);
}

/**
 * Varre todos os produtos em lotes até não haver mais pendentes (após `adminMoveAllAffiliateExpiredProductsToHistory` por iteração).
 * Usar dentro de `runWithMlPlaywrightBrowserSession` para reutilizar o mesmo Chromium.
 */
export async function adminAffiliateValidationSweepAll(opts?: {
  batchSize?: number;
  onBatch?: (info: {
    batchIndex: number;
    batchChecked: number;
    totalChecked: number;
    valid: number;
    invalid: number;
    errors: number;
  }) => void | Promise<void>;
}): Promise<{ batches: number; checked: number; valid: number; invalid: number; errors: number }> {
  const batchSize = Math.min(50, Math.max(1, opts?.batchSize ?? 30));
  let batches = 0;
  let checked = 0;
  let valid = 0;
  let invalid = 0;
  let errors = 0;

  for (;;) {
    await adminMoveAllAffiliateExpiredProductsToHistory();
    const ids = await pickAffiliateValidationProductIds(batchSize);
    if (ids.length === 0) break;
    batches += 1;
    const r = await adminValidateAffiliateLinksBatch(ids);
    checked += r.checked;
    valid += r.valid;
    invalid += r.invalid;
    errors += r.errors;
    await opts?.onBatch?.({
      batchIndex: batches,
      batchChecked: r.checked,
      totalChecked: checked,
      valid,
      invalid,
      errors,
    });
  }

  return { batches, checked, valid, invalid, errors };
}

const PRODUCTS_SELECT_FULL =
  "id,code6,slug,title,images,price,promo_price,is_offer,off_percent,needs_update,affiliate_url,affiliate_valid,affiliate_valid_checked_at,created_at,categories:category_id(id,name,slug)";
const PRODUCTS_SELECT_FALLBACK =
  "id,code6,slug,title,images,price,promo_price,is_offer,off_percent,needs_update,affiliate_url,created_at,categories:category_id(id,name,slug)";

function buildProductsParams(opts: {
  page: number;
  perPage: number;
  needsUpdate?: boolean | null;
  q?: string | null;
  code6?: string | null;
  categoryId?: string | null;
  affiliateExpired?: boolean | null;
  /** `em_promocao` = no catálogo do site (`is_offer`); `fora_promocao` = só preço de lista. */
  promoScope?: "em_promocao" | "fora_promocao" | null;
  includeAffiliateExpired: boolean;
  select: string;
}) {
  const {
    page,
    perPage,
    needsUpdate,
    q,
    code6,
    categoryId,
    affiliateExpired,
    promoScope,
    includeAffiliateExpired,
    select,
  } = opts;
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;
  const params: Record<string, string> = {
    select,
    order: "created_at.desc",
    offset: String(from),
    limit: String(perPage),
  };
  if (needsUpdate === true) params.needs_update = "eq.true";
  if (needsUpdate === false) params.needs_update = "eq.false";
  if (categoryId) params.category_id = `eq.${categoryId}`;
  if (code6?.trim()) params.code6 = `ilike.${ilikeContainsPattern(code6.trim())}`;
  const searchTerm = q?.trim() ?? "";
  if (searchTerm) {
    const pat = ilikeContainsPattern(searchTerm);
    params.or = `(title.ilike.${pat},description.ilike.${pat},description_detail.ilike.${pat})`;
  }
  if (includeAffiliateExpired && affiliateExpired === true) params.affiliate_valid = "eq.false";
  if (promoScope === "em_promocao") params.is_offer = "eq.true";
  if (promoScope === "fora_promocao") params.is_offer = "eq.false";
  return params;
}

export async function adminListProducts(opts: {
  page?: number;
  perPage?: number;
  needsUpdate?: boolean | null;
  q?: string | null;
  code6?: string | null;
  categoryId?: string | null;
  affiliateExpired?: boolean | null;
  promoScope?: "em_promocao" | "fora_promocao" | null;
}) {
  const {
    page = 1,
    perPage = 20,
    needsUpdate = null,
    q,
    code6,
    categoryId,
    affiliateExpired,
    promoScope = "em_promocao",
  } = opts;
  const from = (page - 1) * perPage;

  const params = buildProductsParams({
    page,
    perPage,
    needsUpdate,
    q,
    code6,
    categoryId,
    affiliateExpired,
    promoScope: promoScope ?? null,
    includeAffiliateExpired: true,
    select: PRODUCTS_SELECT_FULL,
  });

  try {
    const { data, count } = await postgrestGetWithCount<any[]>("products", params);
    return { items: Array.isArray(data) ? data : [], total: count ?? 0 };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const columnMissing = /42703|affiliate_valid|does not exist|column/i.test(msg);
    if (!columnMissing) throw err;

    const fallbackParams = buildProductsParams({
      page,
      perPage,
      needsUpdate,
      q,
      code6,
      categoryId,
      affiliateExpired,
      promoScope: promoScope ?? null,
      includeAffiliateExpired: false,
      select: PRODUCTS_SELECT_FALLBACK,
    });
    const { data: fallbackData, count: fallbackCount } = await postgrestGetWithCount<any[]>("products", fallbackParams);
    const items = (Array.isArray(fallbackData) ? fallbackData : []).map((row) => ({
      ...row,
      affiliate_valid: null,
      affiliate_valid_checked_at: null,
    }));
    return { items, total: fallbackCount ?? 0 };
  }
}

export async function adminValidateProductAffiliateLink(productId: string): Promise<{
  valid: boolean;
  error?: string;
}> {
  let row: any;
  try {
    const rows = await postgrestGet<any[]>("products", {
      select: "id,affiliate_url,title,affiliate_valid",
      id: `eq.${productId}`,
      limit: "1",
    });
    row = Array.isArray(rows) ? rows[0] : null;
  } catch {
    const rows = await postgrestGet<any[]>("products", {
      select: "id,affiliate_url,title",
      id: `eq.${productId}`,
      limit: "1",
    });
    row = Array.isArray(rows) ? rows[0] : null;
  }
  if (!row?.affiliate_url) {
    return { valid: false, error: "Produto ou URL não encontrado." };
  }
  /** Já marcado como expirado no banco → envia ao histórico sem novo fetch HTTP. */
  if (row.affiliate_valid === false || row.affiliate_valid === "false") {
    await moveProductToDeletedHistoryAndDelete(productId, "affiliate_expired");
    return { valid: false };
  }
  const title = row.title ? String(row.title).trim() : "";
  const { valid } = await checkAffiliatePageContainsProduct(
    row.affiliate_url,
    title || "Produto",
  );
  const now = new Date().toISOString();
  if (!valid) {
    await moveProductToDeletedHistoryAndDelete(productId, "affiliate_expired");
    return { valid: false };
  }
  await postgrestPatch(
    "products",
    { affiliate_valid: true, affiliate_valid_checked_at: now },
    { id: `eq.${productId}` },
  );
  return { valid: true };
}

/**
 * Move todos os produtos com `affiliate_valid = false` para `deleted_products_history`
 * (motivo `affiliate_expired`). Útil porque a validação HTTP às vezes ainda vê preço na página
 * e não marcaria expirado; o admin já pode ter `false` no banco.
 */
export async function adminMoveAllAffiliateExpiredProductsToHistory(): Promise<{ moved: number }> {
  let moved = 0;
  for (;;) {
    let rows: any[];
    try {
      rows = await postgrestGet<any[]>("products", {
        select: "id",
        affiliate_valid: "eq.false",
        limit: "100",
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      /** Não use o nome da coluna na regex: mensagens de "parse filter" também o citam e engoliam o erro real. */
      const columnMissing =
        /42703|undefined_column/i.test(msg) ||
        /PGRST204/i.test(msg) ||
        /column .* does not exist|does not exist.*column/i.test(msg);
      if (columnMissing) {
        console.warn("[admin] adminMoveAllAffiliateExpiredProductsToHistory: coluna indisponível", msg);
        return { moved: 0 };
      }
      throw e;
    }
    const list = Array.isArray(rows) ? rows : [];
    if (!list.length) break;
    for (const r of list) {
      try {
        await moveProductToDeletedHistoryAndDelete(String(r.id), "affiliate_expired");
        moved += 1;
      } catch (err) {
        console.error("[admin] adminMoveAllAffiliateExpiredProductsToHistory move failed", r.id, err);
      }
    }
    if (list.length < 100) break;
  }
  return { moved };
}

/**
 * Move um produto pelo `code6` quando `affiliate_valid = false` (ex.: corrigir casos presos após falha no sweep).
 */
export async function adminMoveAffiliateExpiredToHistoryByCode6(code6: string): Promise<{
  ok: boolean;
  reason?: string;
}> {
  const trimmed = String(code6 || "").trim();
  if (!trimmed) return { ok: false, reason: "code6_vazio" };
  const rows = await postgrestGet<any[]>("products", {
    select: "id,affiliate_valid",
    code6: `eq.${trimmed}`,
    limit: "1",
  });
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) return { ok: false, reason: "nao_encontrado" };
  const isExpired =
    row.affiliate_valid === false ||
    row.affiliate_valid === "false" ||
    String(row.affiliate_valid).toLowerCase() === "false";
  if (!isExpired) return { ok: false, reason: "nao_expirado" };
  await moveProductToDeletedHistoryAndDelete(String(row.id), "affiliate_expired");
  return { ok: true };
}

const AFFILIATE_VALIDATE_PARALLEL = 10;

export async function adminValidateAffiliateLinksBatch(productIds: string[]): Promise<{
  checked: number;
  valid: number;
  invalid: number;
  errors: number;
}> {
  let valid = 0;
  let invalid = 0;
  let errors = 0;
  for (let i = 0; i < productIds.length; i += AFFILIATE_VALIDATE_PARALLEL) {
    const chunk = productIds.slice(i, i + AFFILIATE_VALIDATE_PARALLEL);
    const chunkResults = await Promise.all(
      chunk.map(async (id) => {
        try {
          const result = await adminValidateProductAffiliateLink(id);
          return { ok: true as const, valid: result.valid };
        } catch (err) {
          console.error("[admin] adminValidateProductAffiliateLink failed", id, err);
          return { ok: false as const };
        }
      }),
    );
    for (const r of chunkResults) {
      if (!r.ok) {
        errors += 1;
        continue;
      }
      if (r.valid) valid += 1;
      else invalid += 1;
    }
  }
  return { checked: productIds.length, valid, invalid, errors };
}

export async function adminBulkUpdateCategory(productIds: string[], categoryId: string) {
  if (!productIds.length) return;
  await postgrestPatch("products", { category_id: categoryId }, { id: inVal(productIds) });
}

export async function adminBulkMarkNeedsUpdate(productIds: string[], needsUpdate: boolean) {
  if (!productIds.length) return;
  await postgrestPatch("products", { needs_update: needsUpdate }, { id: inVal(productIds) });
}

export async function adminBulkDeleteProducts(productIds: string[]) {
  if (!productIds.length) return;
  await postgrestDelete("products", { id: inVal(productIds) });
}

export async function moveProductToDeletedHistoryAndDelete(
  productId: string,
  reason: string = "sync_not_found",
): Promise<void> {
  const rows = await postgrestGet<any[]>("products", {
    select: "id,code6,slug,title,description,images,category_id,price,promo_price,is_offer,off_percent,affiliate_url,source_url",
    id: `eq.${productId}`,
    limit: "1",
  });
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) return;

  const categoryId = row.category_id ?? null;
  let categoryName: string | null = null;
  if (categoryId) {
    try {
      const cats = await postgrestGet<any[]>("categories", {
        select: "name",
        id: `eq.${categoryId}`,
        limit: "1",
      });
      const c = Array.isArray(cats) ? cats[0] : null;
      categoryName = c?.name != null ? String(c.name) : null;
    } catch {
      /* nome da categoria é opcional no histórico */
    }
  }

  await postgrestPost("deleted_products_history", {
    product_id: row.id,
    code6: row.code6 ?? "",
    slug: row.slug ?? "",
    title: row.title ?? "",
    description: row.description ?? "",
    images: row.images ?? [],
    category_id: categoryId,
    category_name: categoryName,
    price: row.price ?? 0,
    promo_price: row.promo_price,
    is_offer: row.is_offer ?? false,
    off_percent: row.off_percent ?? 0,
    affiliate_url: row.affiliate_url ?? "",
    source_url: row.source_url ?? null,
    reason,
  });

  await postgrestDelete("products", { id: `eq.${productId}` });
}

export async function adminListDeletedProductsHistory(opts: { page?: number; perPage?: number }) {
  const { page = 1, perPage = 20 } = opts;
  const from = (page - 1) * perPage;
  const listParams: Record<string, string> = {
    select: "id,product_id,code6,title,images,price,promo_price,category_name,affiliate_url,deleted_at,reason",
    order: "deleted_at.desc",
    offset: String(from),
    limit: String(perPage),
  };

  /**
   * Listagem sem `Prefer: count=exact` na mesma requisição (alguns proxies/versões do PostgREST falham).
   * Total vem de `limit=0` + count=exact, só no `id`.
   */
  let items: any[];
  try {
    items = await postgrestGet<any[]>("deleted_products_history", listParams);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!/PGRST204|column|does not exist|42703/i.test(msg)) throw e;
    console.warn("[admin] adminListDeletedProductsHistory: select completo falhou, tentando sem images", msg);
    items = await postgrestGet<any[]>("deleted_products_history", {
      ...listParams,
      select: "id,product_id,code6,title,price,promo_price,category_name,affiliate_url,deleted_at,reason",
    });
  }
  const list = Array.isArray(items) ? items : [];

  let total = from + list.length;
  try {
    const { count } = await postgrestGetWithCount<unknown[]>("deleted_products_history", {
      select: "id",
      limit: "0",
    });
    total = count;
  } catch (e0) {
    try {
      const { count } = await postgrestGetWithCount<unknown[]>("deleted_products_history", {
        select: "id",
        limit: "1",
      });
      total = count;
    } catch (e) {
      console.warn("[admin] adminListDeletedProductsHistory: count exact falhou, estimativa local", e0, e);
      if (list.length < perPage) total = from + list.length;
      else total = from + list.length + 1;
    }
  }

  return { items: list, total };
}

export async function adminDeleteDeletedHistoryEntry(historyId: string): Promise<void> {
  await postgrestDelete("deleted_products_history", { id: `eq.${historyId}` });
}

/**
 * Recria o produto no catálogo com novo link de afiliado e remove o registo do histórico.
 */
export async function adminRestoreProductFromDeletedHistory(
  historyId: string,
  newAffiliateUrl: string,
): Promise<{ productId: string; code6: string; slug: string }> {
  const url = String(newAffiliateUrl || "").trim();
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    throw new Error("Informe uma URL de afiliado válida (http ou https).");
  }

  const rows = await postgrestGet<any[]>("deleted_products_history", {
    select:
      "id,code6,slug,title,description,images,category_id,price,promo_price,is_offer,off_percent,affiliate_url,source_url",
    id: `eq.${historyId}`,
    limit: "1",
  });
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) throw new Error("Registro não encontrado no histórico.");

  let categoryId = row.category_id as string | null;
  if (!categoryId) {
    const cats = await postgrestGet<any[]>("categories", {
      select: "id",
      order: "created_at.asc",
      limit: "1",
    });
    const c = Array.isArray(cats) ? cats[0] : null;
    if (!c?.id) {
      throw new Error("Não há categoria cadastrada. Crie uma categoria antes de restaurar o produto.");
    }
    categoryId = c.id;
  }

  const now = new Date().toISOString();
  const sourceUrl =
    row.source_url && String(row.source_url).startsWith("http") ? String(row.source_url) : url;

  const inserted = await postgrestPost<any[]>(
    "products",
    {
      code6: row.code6,
      slug: row.slug,
      title: row.title,
      description: row.description ?? "",
      description_detail: "",
      images: row.images ?? [],
      category_id: categoryId,
      price: row.price,
      promo_price: row.promo_price,
      is_offer: row.is_offer ?? false,
      off_percent: row.off_percent ?? 0,
      rating: null,
      reviews_count: null,
      affiliate_code: "ml",
      affiliate_url: url,
      source_url: sourceUrl,
      needs_update: false,
      last_seen_at: now,
      affiliate_valid: null,
      affiliate_valid_checked_at: null,
      is_active: true,
    },
    "service",
    { select: "id,code6,slug", returning: true },
  );
  const p = Array.isArray(inserted) ? inserted[0] : null;
  if (!p?.id) throw new Error("Falha ao restaurar produto.");

  await postgrestDelete("deleted_products_history", { id: `eq.${historyId}` });

  return { productId: p.id, code6: p.code6, slug: p.slug };
}

export async function recordProductPriceChange(opts: {
  productId: string;
  oldPrice: number;
  newPrice: number;
  oldPromoPrice: number | null;
  newPromoPrice: number | null;
  source?: string;
}): Promise<void> {
  const { productId, oldPrice, newPrice, oldPromoPrice, newPromoPrice, source = "sync" } = opts;
  const priceChanged = oldPrice !== newPrice || (oldPromoPrice ?? 0) !== (newPromoPrice ?? 0);
  if (!priceChanged) return;
  await postgrestPost("product_price_history", {
    product_id: productId,
    old_price: oldPrice,
    new_price: newPrice,
    old_promo_price: oldPromoPrice,
    new_promo_price: newPromoPrice,
    source,
  });
}

function toDayStartUtcIso(dateYmd: string): string {
  const s = String(dateYmd || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
  return `${s}T00:00:00.000Z`;
}

function toDayEndUtcIso(dateYmd: string): string {
  const s = String(dateYmd || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
  return `${s}T23:59:59.999Z`;
}

function isPgrstFunctionMissing(e: unknown): boolean {
  if (!(e instanceof PostgrestError)) return false;
  const d = e.details as { code?: string } | undefined;
  if (d?.code === "PGRST202") return true;
  return String(e.message).includes("PGRST202");
}

/**
 * Purge sem RPC (só DELETE em product_price_history) — funciona mesmo sem a função SQL no banco.
 * Apaga em lotes por id para compatibilidade com PostgREST puro.
 */
async function purgePriceHistoryViaTableDelete(opts: {
  deleteAll: boolean;
  dateFrom?: string | null;
  dateTo?: string | null;
  categoryId?: string | null;
}): Promise<number> {
  const { deleteAll } = opts;
  const hasDateFrom = !!opts.dateFrom?.trim();
  const hasDateTo = !!opts.dateTo?.trim();
  const categoryId = opts.categoryId?.trim() || null;
  const dateFromIso = hasDateFrom ? toDayStartUtcIso(opts.dateFrom!) : "";
  const dateToIso = hasDateTo ? toDayEndUtcIso(opts.dateTo!) : "";

  const batchLimit = "500";
  const order = "changed_at.asc";

  const andDateParts: string[] = [];
  if (dateFromIso) andDateParts.push(`changed_at.gte.${dateFromIso}`);
  if (dateToIso) andDateParts.push(`changed_at.lte.${dateToIso}`);
  const andDate =
    andDateParts.length > 0 ? `(${andDateParts.join(",")})` : null;

  const baseListParams = (): Record<string, string> => {
    if (deleteAll) {
      return { select: "id", order, limit: batchLimit };
    }
    if (categoryId) {
      const p: Record<string, string> = {
        select: "id,products!inner(category_id)",
        order,
        limit: batchLimit,
        "products.category_id": `eq.${categoryId}`,
      };
      if (andDate) p.and = andDate;
      return p;
    }
    const p: Record<string, string> = {
      select: "id",
      order,
      limit: batchLimit,
    };
    if (andDate) p.and = andDate;
    return p;
  };

  let deleted = 0;
  for (;;) {
    const rows = await postgrestGet<any[]>("product_price_history", baseListParams());
    const list = Array.isArray(rows) ? rows : [];
    if (!list.length) break;
    const ids = list.map((r) => r.id).filter(Boolean);
    if (!ids.length) break;
    await postgrestDelete("product_price_history", { id: inVal(ids) });
    deleted += ids.length;
  }
  return deleted;
}

export async function adminListPriceHistory(opts: {
  page?: number;
  perPage?: number;
  dateFrom?: string | null;
  dateTo?: string | null;
  categoryId?: string | null;
}) {
  const { page = 1, perPage = 20 } = opts;
  const from = (page - 1) * perPage;
  const dateFromIso = opts.dateFrom ? toDayStartUtcIso(opts.dateFrom) : "";
  const dateToIso = opts.dateTo ? toDayEndUtcIso(opts.dateTo) : "";
  const categoryId = opts.categoryId?.trim() || "";

  const selectEmbed = categoryId
    ? "id,product_id,old_price,new_price,old_promo_price,new_promo_price,changed_at,source,products!inner(code6,title,category_id)"
    : "id,product_id,old_price,new_price,old_promo_price,new_promo_price,changed_at,source,products:product_id(code6,title,category_id)";

  const params: Record<string, string> = {
    select: selectEmbed,
    order: "changed_at.desc",
    offset: String(from),
    limit: String(perPage),
  };

  if (categoryId) {
    params["products.category_id"] = `eq.${categoryId}`;
  }

  const andParts: string[] = [];
  if (dateFromIso) andParts.push(`changed_at.gte.${dateFromIso}`);
  if (dateToIso) andParts.push(`changed_at.lte.${dateToIso}`);
  if (andParts.length) {
    params.and = `(${andParts.join(",")})`;
  }

  const { data, count } = await postgrestGetWithCount<any[]>("product_price_history", params);
  return { items: Array.isArray(data) ? data : [], total: count ?? 0 };
}

export async function adminPurgePriceHistory(opts: {
  deleteAll: boolean;
  dateFrom?: string | null;
  dateTo?: string | null;
  categoryId?: string | null;
}): Promise<number> {
  const { deleteAll } = opts;
  const hasDateFrom = !!opts.dateFrom?.trim();
  const hasDateTo = !!opts.dateTo?.trim();
  const categoryId = opts.categoryId?.trim() || null;

  if (!deleteAll && !hasDateFrom && !hasDateTo && !categoryId) {
    throw new Error("Informe período (data) e/ou categoria, ou use exclusão total.");
  }

  const dateFromIso = hasDateFrom ? toDayStartUtcIso(opts.dateFrom!) : null;
  const dateToIso = hasDateTo ? toDayEndUtcIso(opts.dateTo!) : null;

  try {
    const raw = await postgrestRpc<unknown>("admin_purge_product_price_history", {
      payload: {
        p_delete_all: deleteAll,
        p_date_from: dateFromIso,
        p_date_to: dateToIso,
        p_category_id: categoryId || null,
      },
    });
    const n = typeof raw === "number" ? raw : Number(raw);
    return Number.isFinite(n) ? n : 0;
  } catch (e) {
    if (isPgrstFunctionMissing(e)) {
      return purgePriceHistoryViaTableDelete({
        deleteAll,
        dateFrom: opts.dateFrom,
        dateTo: opts.dateTo,
        categoryId,
      });
    }
    throw e;
  }
}

const INTERNAL_SITE_SETTINGS_COLOR_PREFIX = "__cron_";

export async function adminUpdateSiteColors(colors: Record<string, string>) {
  const rows = await postgrestGet<any[]>("site_settings", { select: "id,colors", limit: "1" });
  const data = Array.isArray(rows) ? rows[0] : null;
  const prev =
    data?.colors && typeof data.colors === "object" && data.colors !== null ?
      { ...(data.colors as Record<string, string>) }
    : {};
  const merged: Record<string, string> = { ...prev };
  for (const [k, v] of Object.entries(colors)) {
    merged[k] = v;
  }
  for (const k of Object.keys(prev)) {
    if (k.startsWith(INTERNAL_SITE_SETTINGS_COLOR_PREFIX) && !(k in colors)) {
      merged[k] = prev[k];
    }
  }
  if (!data) {
    await postgrestPost("site_settings", { colors: merged });
    return;
  }
  await postgrestPatch("site_settings", { colors: merged }, { id: `eq.${data.id}` });
}

export async function adminUpdateLogoUrl(logoUrl: string | null) {
  const rows = await postgrestGet<any[]>("site_settings", { select: "id", limit: "1" });
  const data = Array.isArray(rows) ? rows[0] : null;
  if (!data) {
    await postgrestPost("site_settings", { logo_url: logoUrl });
    return;
  }
  await postgrestPatch("site_settings", { logo_url: logoUrl }, { id: `eq.${data.id}` });
}

export async function adminUpdateOffersSectionPosition(position: "after_hero" | "before_hero") {
  const rows = await postgrestGet<any[]>("site_settings", { select: "id", limit: "1" });
  const data = Array.isArray(rows) ? rows[0] : null;
  if (!data) {
    await postgrestPost("site_settings", { offers_section_position: position });
    return;
  }
  await postgrestPatch("site_settings", { offers_section_position: position }, { id: `eq.${data.id}` });
}

export async function adminGetSiteSettings() {
  const rows = await postgrestGet<any[]>("site_settings", {
    select: "id,logo_url,colors,offers_section_position",
    limit: "1",
  });
  const row = Array.isArray(rows) && rows[0] ? rows[0] : null;
  if (!row) return null;
  const c = row.colors;
  if (!c || typeof c !== "object") return row;
  const colors = Object.fromEntries(
    Object.entries(c as Record<string, unknown>).filter(([k]) => !k.startsWith(INTERNAL_SITE_SETTINGS_COLOR_PREFIX)),
  );
  return { ...row, colors };
}

export async function adminGetContactSettings() {
  const rows = await postgrestGet<any[]>("contact_settings", {
    select: "id,address,city,state,phone,email",
    limit: "1",
  });
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

export async function adminUpdateContactSettings(patch: Record<string, any>) {
  const current = await adminGetContactSettings();
  if (!current) {
    await postgrestPost("contact_settings", patch);
    return;
  }
  await postgrestPatch("contact_settings", patch, { id: `eq.${current.id}` });
}

export async function adminListSocialLinks() {
  const data = await postgrestGet<any[]>("social_links", {
    select: "id,icon,url,color,sort_order",
    order: "sort_order.asc",
  });
  return Array.isArray(data) ? data : [];
}

export async function adminUpsertSocialLink(input: {
  id?: string;
  icon: string;
  url: string;
  color?: string | null;
  sort_order?: number;
}) {
  if (input.id) {
    await postgrestPatch(
      "social_links",
      {
        icon: input.icon,
        url: input.url,
        color: input.color ?? null,
        sort_order: input.sort_order ?? 0,
      },
      { id: `eq.${input.id}` },
    );
    return;
  }
  await postgrestPost("social_links", {
    icon: input.icon,
    url: input.url,
    color: input.color ?? null,
    sort_order: input.sort_order ?? 0,
  });
}

export async function adminDeleteSocialLink(id: string) {
  await postgrestDelete("social_links", { id: `eq.${id}` });
}

export async function adminListTokens() {
  const data = await postgrestGet<any[]>("admin_tokens", {
    select: "id,name,active,last_used_at,created_at",
    order: "created_at.desc",
  });
  return Array.isArray(data) ? data : [];
}

export async function adminCreateToken(name: string) {
  const raw = randomToken(32);
  const token_hash = sha256Hex(raw);
  const inserted = await postgrestPost<any[]>(
    "admin_tokens",
    { name, token_hash, active: true },
    "service",
    { select: "id", returning: true },
  );
  const arr = Array.isArray(inserted) ? inserted : [];
  const id = arr[0]?.id;
  if (!id) throw new Error("Falha ao criar token.");
  return { id, token: raw };
}

export async function adminRevokeToken(id: string) {
  await postgrestPatch("admin_tokens", { active: false }, { id: `eq.${id}` });
}

export async function adminListCarousel() {
  const data = await postgrestGet<any[]>("carousel_items", {
    select: "id,product_id,sort_order,size,products:product_id(code6,slug,title,images)",
    order: "sort_order.asc",
  });
  return Array.isArray(data) ? data : [];
}

export async function adminSetCarousel(items: { product_id: string; sort_order: number; size: "S" | "M" | "G" }[]) {
  const seen = new Set<string>();
  const deduped: { product_id: string; sort_order: number; size: "S" | "M" | "G" }[] = [];
  for (const row of items) {
    if (!row.product_id || seen.has(row.product_id)) continue;
    seen.add(row.product_id);
    deduped.push(row);
  }
  for (let i = 0; i < deduped.length; i++) {
    deduped[i] = { ...deduped[i], sort_order: i };
  }
  await postgrestDelete("carousel_items", { id: `neq.00000000-0000-0000-0000-000000000000` });
  if (!deduped.length) return;
  await postgrestPost("carousel_items", deduped);
}

export async function buildProductSlug(title: string, code6: string) {
  const base = slugify(title);
  return `${base}-${code6}`;
}
