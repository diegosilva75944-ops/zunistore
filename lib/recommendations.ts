/**
 * APIs de recomendação (`/api/recommendations/*`): sessão via cookie `zuni_visit_sid` + `credentials: "include"`.
 */
export const recommendationApi = {
  personalized: "/api/recommendations/personalized",
  searchBased: "/api/recommendations/search-based",
  recent: "/api/recommendations/recent",
  popular: "/api/recommendations/popular",
} as const;
