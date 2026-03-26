import "server-only";

import { z } from "zod";
import { mlSearchPublicByNickname, mlSearchPublicBySellerId, mlSearchPublicByTerm } from "./api";

const searchItemSchema = z.object({
  id: z.string().optional(),
  title: z.string().optional(),
  permalink: z.string().optional(),
  thumbnail: z.string().optional().nullable(),
  price: z.number().optional().nullable(),
  original_price: z.number().optional().nullable(),
  currency_id: z.string().optional().nullable(),
  category_id: z.string().optional().nullable(),
  seller: z
    .object({
      id: z.union([z.number(), z.string()]).optional().nullable(),
      nickname: z.string().optional().nullable(),
    })
    .optional()
    .nullable(),
  attributes: z.array(z.unknown()).optional().nullable(),
});

export type MlSearchListing = {
  item_id: string;
  title: string;
  permalink: string | null;
  thumbnail: string | null;
  price: number | null;
  original_price: number | null;
  currency: string | null;
  category_id: string | null;
  seller_id: string | null;
  seller_nickname: string | null;
};

export function normalizeSearchListing(raw: unknown): MlSearchListing | null {
  const parsed = searchItemSchema.safeParse(raw);
  if (!parsed.success) return null;
  const r = parsed.data;
  const itemId = (r.id || "").toUpperCase();
  if (!itemId) return null;
  return {
    item_id: itemId,
    title: String(r.title || "").trim(),
    permalink: r.permalink ? String(r.permalink) : null,
    thumbnail: r.thumbnail ? String(r.thumbnail) : null,
    price: r.price == null ? null : Number(r.price),
    original_price: r.original_price == null ? null : Number(r.original_price),
    currency: r.currency_id ? String(r.currency_id) : null,
    category_id: r.category_id ? String(r.category_id) : null,
    seller_id: r.seller?.id == null ? null : String(r.seller.id),
    seller_nickname: r.seller?.nickname ? String(r.seller.nickname) : null,
  };
}

export async function mlSearchListings(opts:
  | { kind: "term"; term: string; limit?: number; offset?: number }
  | { kind: "seller_id"; sellerId: string | number; limit?: number; offset?: number }
  | { kind: "nickname"; nickname: string; limit?: number; offset?: number }
) {
  const limit = Math.min(50, Math.max(1, opts.limit ?? 20));
  const offset = Math.max(0, opts.offset ?? 0);

  const res =
    opts.kind === "term"
      ? await mlSearchPublicByTerm({ term: opts.term, limit, offset })
      : opts.kind === "seller_id"
        ? await mlSearchPublicBySellerId({ sellerId: opts.sellerId, limit, offset })
        : await mlSearchPublicByNickname({ nickname: opts.nickname, limit, offset });

  const items = (Array.isArray(res.results) ? res.results : [])
    .map(normalizeSearchListing)
    .filter(Boolean) as MlSearchListing[];

  return { total: res.total, offset: res.offset, limit: res.limit, items };
}

