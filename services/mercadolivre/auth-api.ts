import "server-only";

import { z } from "zod";
import { mlApiGetJson } from "@/lib/mercadolivre/client";
import { MercadoLivreApiError } from "@/lib/mercadolivre/client";
import { MercadoLivreNotAuthorizedError } from "@/lib/mercadolivre/get-valid-token";
import { MercadoLivreError } from "./errors";

// Schemas mínimos (tolerantes)
const itemSchema = z.object({
  id: z.string(),
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
});

const categorySchema = z.object({
  id: z.string(),
  name: z.string().optional().nullable(),
  path_from_root: z
    .array(z.object({ id: z.string(), name: z.string() }))
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

export type MlItemAuth = z.infer<typeof itemSchema>;
export type MlDescriptionAuth = z.infer<typeof descriptionSchema>;
export type MlCategoryAuth = z.infer<typeof categorySchema>;

export async function mlGetItemAuth(itemId: string): Promise<MlItemAuth> {
  const json = await mlApiGetJson<unknown>({ path: `/items/${encodeURIComponent(itemId)}` });
  const parsed = itemSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error("Formato inesperado ao carregar item do Mercado Livre.");
  }
  return parsed.data;
}

export async function mlGetItemDescriptionAuth(itemId: string): Promise<MlDescriptionAuth> {
  const json = await mlApiGetJson<unknown>({ path: `/items/${encodeURIComponent(itemId)}/description` });
  const parsed = descriptionSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error("Formato inesperado ao carregar descrição do Mercado Livre.");
  }
  return parsed.data;
}

export async function mlGetCategoryAuth(categoryId: string): Promise<MlCategoryAuth> {
  const json = await mlApiGetJson<unknown>({ path: `/categories/${encodeURIComponent(categoryId)}` });
  const parsed = categorySchema.safeParse(json);
  if (!parsed.success) {
    throw new Error("Formato inesperado ao carregar categoria do Mercado Livre.");
  }
  return parsed.data;
}

export async function mlSearchAuth(opts: { siteId: string; query: Record<string, string | number> }) {
  const json = await mlApiGetJson<unknown>({ path: `/sites/${opts.siteId}/search`, query: opts.query });
  const parsed = searchSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error("Formato inesperado ao pesquisar anúncios do Mercado Livre.");
  }
  const paging = parsed.data.paging ?? {};
  return {
    total: paging.total ?? 0,
    offset: paging.offset ?? 0,
    limit: paging.limit ?? 0,
    results: Array.isArray(parsed.data.results) ? parsed.data.results : [],
  };
}

const productSchema = z.object({
  id: z.string(),
  status: z.string().optional().nullable(),
  buy_box_winner: z
    .object({
      item_id: z.string().optional().nullable(),
      price: z.number().optional().nullable(),
      currency_id: z.string().optional().nullable(),
    })
    .optional()
    .nullable(),
});

export type MlProductAuth = z.infer<typeof productSchema>;

export async function mlGetProductAuth(productId: string): Promise<MlProductAuth> {
  const json = await mlApiGetJson<unknown>({ path: `/products/${encodeURIComponent(productId)}` });
  const parsed = productSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error("Formato inesperado ao carregar produto de catálogo do Mercado Livre.");
  }
  return parsed.data;
}

export async function mlResolveProductToItemAuth(productId: string): Promise<string | null> {
  /**
   * O endpoint `/products/{product_id}/items` foi descontinuado.
   * Fluxo atual: usar `/products/{product_id}` e pegar `buy_box_winner.item_id`.
   * @see https://developers.mercadolivre.com.br/en_us/catalog-competition
   */
  const p = await mlGetProductAuth(productId);
  const itemId = p.buy_box_winner?.item_id;
  if (typeof itemId === "string" && /^MLB\d{6,}$/i.test(itemId)) return itemId.toUpperCase();
  return null;
}

export function mapMlApiError(e: unknown): { success: false; error: string; externalStatus?: number } {
  if (e instanceof MercadoLivreError) {
    if (e.code === "invalid_link" || e.code === "invalid_item_id") {
      return { success: false, error: e.message, externalStatus: 400 };
    }
    if (e.code === "not_found") {
      return { success: false, error: e.message, externalStatus: 404 };
    }
    if (e.code === "inactive") {
      return { success: false, error: e.message, externalStatus: 410 };
    }
    if (e.code === "rate_limited") {
      return { success: false, error: e.message, externalStatus: 429 };
    }
    return { success: false, error: e.message || "Falha ao consultar Mercado Livre", externalStatus: e.status };
  }
  if (e instanceof MercadoLivreNotAuthorizedError) {
    return { success: false, error: e.message, externalStatus: 401 };
  }
  if (e instanceof MercadoLivreApiError) {
    if (e.externalStatus === 403) {
      return { success: false, error: "Mercado Livre recusou a consulta do anúncio", externalStatus: 403 };
    }
    return { success: false, error: "Falha ao consultar Mercado Livre", externalStatus: e.externalStatus };
  }
  return { success: false, error: "Falha ao consultar Mercado Livre" };
}

