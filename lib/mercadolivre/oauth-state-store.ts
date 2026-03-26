import "server-only";

import { sha256Hex } from "@/lib/crypto";
import { postgrestDelete, postgrestGet, postgrestPatch, postgrestPost } from "@/lib/postgrest/server";

const STATE_TTL_SECONDS = 10 * 60;

export function hashState(state: string) {
  return sha256Hex(`ml_oauth_state:${state}`);
}

export async function createOAuthState(state: string) {
  const now = Date.now();
  const expiresAt = new Date(now + STATE_TTL_SECONDS * 1000).toISOString();
  const state_hash = hashState(state);
  try {
    await postgrestPost(
      "mercadolivre_oauth_states",
      { state_hash, expires_at: expiresAt },
      "service",
      { upsert: true, onConflict: "state_hash", returning: false },
    );
    return { ok: true as const, expiresAt };
  } catch (e) {
    return { ok: false as const, expiresAt, error: e };
  }
}

export async function consumeOAuthState(
  state: string,
): Promise<{ ok: boolean; reason?: string; storeError?: unknown }> {
  const state_hash = hashState(state);
  try {
    const rows = await postgrestGet<any[]>("mercadolivre_oauth_states", {
      select: "id,expires_at,used_at",
      state_hash: `eq.${state_hash}`,
      limit: "1",
    });
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row?.id) return { ok: false, reason: "not_found" };
    if (row.used_at) return { ok: false, reason: "already_used" };
    const exp = new Date(String(row.expires_at)).getTime();
    if (!Number.isFinite(exp) || exp < Date.now()) return { ok: false, reason: "expired" };

    await postgrestPatch(
      "mercadolivre_oauth_states",
      { used_at: new Date().toISOString() },
      { id: `eq.${row.id}` },
    );
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: "store_error", storeError: e };
  }
}

/** Opcional: limpeza de estados antigos (não é obrigatório para o fluxo). */
export async function purgeExpiredOAuthStates() {
  const cutoff = new Date(Date.now() - STATE_TTL_SECONDS * 1000).toISOString();
  await postgrestDelete("mercadolivre_oauth_states", { expires_at: `lt.${cutoff}` });
}

