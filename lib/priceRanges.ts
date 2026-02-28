export type PriceRange = { slug: string; label: string; min: number | null; max: number | null };

export const PRICE_RANGES: PriceRange[] = [
  { slug: "ate-100", label: "Até R$ 100", min: null, max: 100 },
  { slug: "100-a-200", label: "R$ 100 a R$ 200", min: 100, max: 200 },
  { slug: "200-a-400", label: "R$ 200 a R$ 400", min: 200, max: 400 },
  { slug: "400-a-800", label: "R$ 400 a R$ 800", min: 400, max: 800 },
  { slug: "800-a-1500", label: "R$ 800 a R$ 1500", min: 800, max: 1500 },
  { slug: "acima-1500", label: "Acima de R$ 1500", min: 1500, max: null },
];

export function getPriceRangeBySlug(slug: string) {
  return PRICE_RANGES.find((r) => r.slug === slug) ?? null;
}

