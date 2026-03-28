export type PersonalizationConsentValue = "accepted" | "rejected";

export type RecentProductSnapshot = {
  id: string;
  code6: string;
  slug: string;
  title: string;
  images: string[];
  category_id: string;
  price: number;
  promo_price: number | null;
  is_offer: boolean;
  off_percent: number;
  affiliate_url: string;
  rating: number | null;
  reviews_count: number | null;
  at: number;
};

export type LocalSearchEntry = { term: string; at: number };
export type LocalProductRef = { productId: string; categoryId: string | null; at: number };
export type LocalCategoryRef = { categoryId: string; at: number };
