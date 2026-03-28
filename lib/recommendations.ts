/**
 * APIs de recomendação são consumidas via fetch nas rotas `/api/recommendations/*`.
 * Este arquivo centraliza paths para evitar strings soltas no cliente.
 */
export const recommendationApi = {
  personalized: "/api/recommendations/personalized",
  searchBased: "/api/recommendations/search-based",
  recent: "/api/recommendations/recent",
  popular: "/api/recommendations/popular",
} as const;
