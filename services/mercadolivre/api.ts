import "server-only";

import { z } from "zod";
import { mlFetchJson } from "./http";
import { MercadoLivreError } from "./errors";
import { isValidMlItemId } from "./parser";

const SITE_ID = "MLB";

// Schemas mínimos (tolerantes) para não quebrar quando a API variar.
const itemSchema = z.object({
  id: z.string(),
  site_id: z.string().optional(),
  title: z.string().optional(),
  permalink: z.string().url().optional(),
  status: z.string().optional(),
  seller_id: z.union([z.number(), z.string()]).optional().nullable(),
  category_id: z.string().optional().nullable(),
  currency_id: z.string().optional().nullable(),
  price: z.number().optional().nullable(),
  base_price: z.number().optional().nullable(),
  original_price: z.number().optional().nullable(),
  pictures: z
    .array(
      z.object({
        id: z.string().optional(),
        url: z.string().url().optional(),
        secure_url: z.string().url().optional(),
      }),
    )
    .optional()
    .nullable(),
  thumbnail: z.string().optional().nullable(),
  attributes: z
    .array(
      z.object({
        id: z.string().optional(),
        name: z.string().optional(),
        value_name: z.string().optional().nullable(),
      }),
    )
    .optional()
    .nullable(),
});

const descriptionSchema = z.object({
  plain_text: z.string().optional().nullable(),
  text: z.string().optional().nullable(),
  last_updated: z.string().optional().nullable(),
});

const categorySchema = z.object({
  id: z.string(),
  name: z.string().optional().nullable(),
  path_from_root: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
      }),
    )
    .optional()
    .nullable(),
});

const searchSchema = z.object({
  paging: z
    .object({
      total: z.number().optional(),
      offset: z.number().optional(),
      limit: z.number().optional(),
    })
    .optional(),
  results: z.array(z.unknown()).optional(),
});

export type MlPublicItem = z.infer<typeof itemSchema>;
export type MlPublicDescription = z.infer<typeof descriptionSchema>;

export async function mlGetItemPublic(itemId: string): Promise<MlPublicItem> {
  const id = String(itemId || "").trim().toUpperCase();
  if (!isValidMlItemId(id)) {
    throw new MercadoLivreError("invalid_item_id", "item_id inválido (esperado algo como MLB123…).");
  }
  const json = await mlFetchJson<unknown>({ path: `/items/${encodeURIComponent(id)}` });
  const parsed = itemSchema.safeParse(json);
  if (!parsed.success) {
    console.error("[mercadolivre] item schema mismatch", { id, issues: parsed.error.issues });
    throw new MercadoLivreError("unexpected_response", "Formato inesperado ao carregar o item público.", {
      details: parsed.error.issues,
    });
  }
  return parsed.data;
}

export async function mlGetItemDescriptionPublic(itemId: string): Promise<MlPublicDescription> {
  const id = String(itemId || "").trim().toUpperCase();
  if (!isValidMlItemId(id)) {
    throw new MercadoLivreError("invalid_item_id", "item_id inválido (esperado algo como MLB123…).");
  }
  const json = await mlFetchJson<unknown>({
    path: `/items/${encodeURIComponent(id)}/description`,
  });
  const parsed = descriptionSchema.safeParse(json);
  if (!parsed.success) {
    console.error("[mercadolivre] description schema mismatch", { id, issues: parsed.error.issues });
    throw new MercadoLivreError(
      "unexpected_response",
      "Formato inesperado ao carregar a descrição pública do item.",
      { details: parsed.error.issues },
    );
  }
  return parsed.data;
}

export type MlPublicCategory = z.infer<typeof categorySchema>;

export async function mlGetCategoryPublic(categoryId: string): Promise<MlPublicCategory> {
  const id = String(categoryId || "").trim().toUpperCase();
  if (!id) {
    throw new MercadoLivreError("unexpected_response", "category_id ausente.");
  }
  const json = await mlFetchJson<unknown>({ path: `/categories/${encodeURIComponent(id)}` });
  const parsed = categorySchema.safeParse(json);
  if (!parsed.success) {
    console.error("[mercadolivre] category schema mismatch", { id, issues: parsed.error.issues });
    throw new MercadoLivreError("unexpected_response", "Formato inesperado ao carregar categoria pública.", {
      details: parsed.error.issues,
    });
  }
  return parsed.data;
}

export type MlSearchResult = {
  total: number;
  offset: number;
  limit: number;
  results: unknown[];
};

function normalizeSearch(json: unknown): MlSearchResult {
  const parsed = searchSchema.safeParse(json);
  if (!parsed.success) {
    console.error("[mercadolivre] search schema mismatch", parsed.error.issues);
    throw new MercadoLivreError("unexpected_response", "Formato inesperado ao pesquisar anúncios.", {
      details: parsed.error.issues,
    });
  }
  const paging = parsed.data.paging ?? {};
  return {
    total: paging.total ?? 0,
    offset: paging.offset ?? 0,
    limit: paging.limit ?? 0,
    results: Array.isArray(parsed.data.results) ? parsed.data.results : [],
  };
}

export async function mlSearchPublicByTerm(opts: {
  term: string;
  limit?: number;
  offset?: number;
}) {
  const term = String(opts.term || "").trim();
  if (term.length < 2) {
    return { total: 0, offset: 0, limit: 0, results: [] as unknown[] };
  }
  const limit = Math.min(50, Math.max(1, opts.limit ?? 20));
  const offset = Math.max(0, opts.offset ?? 0);
  const json = await mlFetchJson<unknown>({
    path: `/sites/${SITE_ID}/search`,
    query: { q: term, limit, offset },
  });
  return normalizeSearch(json);
}

export async function mlSearchPublicBySellerId(opts: {
  sellerId: string | number;
  limit?: number;
  offset?: number;
}) {
  const sellerId = String(opts.sellerId ?? "").trim();
  if (!sellerId) {
    throw new MercadoLivreError("unexpected_response", "seller_id ausente.");
  }
  const limit = Math.min(50, Math.max(1, opts.limit ?? 20));
  const offset = Math.max(0, opts.offset ?? 0);
  const json = await mlFetchJson<unknown>({
    path: `/sites/${SITE_ID}/search`,
    query: { seller_id: sellerId, limit, offset },
  });
  return normalizeSearch(json);
}

export async function mlSearchPublicByNickname(opts: {
  nickname: string;
  limit?: number;
  offset?: number;
}) {
  const nickname = String(opts.nickname ?? "").trim();
  if (!nickname) {
    throw new MercadoLivreError("unexpected_response", "nickname ausente.");
  }
  const limit = Math.min(50, Math.max(1, opts.limit ?? 20));
  const offset = Math.max(0, opts.offset ?? 0);
  const json = await mlFetchJson<unknown>({
    path: `/sites/${SITE_ID}/search`,
    query: { nickname, limit, offset },
  });
  return normalizeSearch(json);
}

