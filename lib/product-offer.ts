/** Alinha `is_offer` / `off_percent` com `price` e `promo_price` após sync. */
export function offerFieldsFromPrices(price: number, promo_price: number | null): {
  is_offer: boolean;
  off_percent: number;
} {
  const p = Number(price);
  const promo = promo_price != null && Number.isFinite(promo_price) ? Number(promo_price) : null;
  const is_offer = promo != null && promo < p && p > 0;
  const off_percent =
    is_offer && promo != null ? Math.min(100, Math.max(0, Math.round((1 - promo / p) * 100))) : 0;
  return { is_offer, off_percent };
}
