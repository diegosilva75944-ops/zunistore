import "server-only";

import { postgrestPost, postgrestRpc } from "@/lib/postgrest/server";

async function touchSession(sessionId: string, userId: string | null) {
  await postgrestRpc("personalization_upsert_session", {
    p_session_id: sessionId,
    p_user_id: userId,
  });
}

export async function persistSearchEvent(opts: {
  sessionId: string;
  userId?: string | null;
  term: string;
  normalizedTerm: string;
}) {
  const { sessionId, userId = null, term, normalizedTerm } = opts;
  await touchSession(sessionId, userId);
  await postgrestPost(
    "user_search_events",
    {
      session_id: sessionId,
      user_id: userId,
      term: term.slice(0, 500),
      normalized_term: normalizedTerm.slice(0, 300),
    },
    "service",
    { returning: false },
  );
}

export async function persistProductClick(opts: {
  sessionId: string;
  userId?: string | null;
  productId: string;
  categoryId: string | null;
}) {
  const { sessionId, userId = null, productId, categoryId } = opts;
  await touchSession(sessionId, userId);
  await postgrestPost(
    "user_product_click_events",
    {
      session_id: sessionId,
      user_id: userId,
      product_id: productId,
      category_id: categoryId,
    },
    "service",
    { returning: false },
  );
  await postgrestRpc("personalization_bump_product_day", {
    p_product_id: productId,
    p_search_delta: 0,
    p_click_delta: 3,
    p_view_delta: 0,
  });
}

export async function persistProductView(opts: {
  sessionId: string;
  userId?: string | null;
  productId: string;
  categoryId: string | null;
}) {
  const { sessionId, userId = null, productId, categoryId } = opts;
  await touchSession(sessionId, userId);
  await postgrestPost(
    "user_product_view_events",
    {
      session_id: sessionId,
      user_id: userId,
      product_id: productId,
      category_id: categoryId,
    },
    "service",
    { returning: false },
  );
  await postgrestRpc("personalization_bump_product_day", {
    p_product_id: productId,
    p_search_delta: 0,
    p_click_delta: 0,
    p_view_delta: 1,
  });
}

export async function persistCategoryVisit(opts: {
  sessionId: string;
  userId?: string | null;
  categoryId: string;
}) {
  const { sessionId, userId = null, categoryId } = opts;
  await touchSession(sessionId, userId);
  await postgrestPost(
    "user_category_visit_events",
    {
      session_id: sessionId,
      user_id: userId,
      category_id: categoryId,
    },
    "service",
    { returning: false },
  );
  await postgrestRpc("personalization_bump_category_day", {
    p_category_id: categoryId,
    p_visit_delta: 2,
  });
}
