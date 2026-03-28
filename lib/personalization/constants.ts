/** Chaves localStorage alinhadas ao contrato da vitrine personalizada. */
export const ZUNI_LS = {
  cookieConsent: "zuni_cookie_consent",
  personalizationConsent: "zuni_personalization_consent",
  sessionId: "zuni_session_id",
  searchHistory: "zuni_search_history",
  productClicks: "zuni_product_clicks",
  productViews: "zuni_product_views",
  categoryVisits: "zuni_category_visits",
  recentProducts: "zuni_recent_products",
} as const;

/** Evita reenvio de visualização do mesmo produto na mesma aba. */
export const SS_VIEW_PREFIX = "zuni_pv_";
