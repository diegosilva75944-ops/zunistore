import "server-only";

import { postgrestDelete } from "@/lib/postgrest/server";

const eq = (sid: string) => `eq.${sid}`;

/** Remove eventos da sessão no Postgres (visitante). */
export async function clearPersonalizationSession(sessionId: string) {
  const f = { session_id: eq(sessionId) };
  await postgrestDelete("user_search_events", f);
  await postgrestDelete("user_product_click_events", f);
  await postgrestDelete("user_product_view_events", f);
  await postgrestDelete("user_category_visit_events", f);
  await postgrestDelete("personalization_sessions", f);
}
