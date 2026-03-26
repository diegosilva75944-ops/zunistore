import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { getAdminSession } from "@/lib/admin/auth";
import { exchangeCodeForToken, computeExpiresAt, getMercadoLivreTokenEndpointUrl } from "@/lib/mercadolivre/oauth";
import { getMlTokenByUserId, upsertMlToken } from "@/lib/mercadolivre/token-store";
import { consumeOAuthState } from "@/lib/mercadolivre/oauth-state-store";
import { MercadoLivreError } from "@/services/mercadolivre/errors";
import { PostgrestError } from "@/lib/postgrest/server";

export const runtime = "nodejs";

const STATE_COOKIE = "ml_oauth_state";

const querySchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
});

export async function GET(req: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "Não autenticado." }, { status: 401 });
  }

  const debug = process.env.NODE_ENV !== "production";
  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse({
    code: searchParams.get("code"),
    state: searchParams.get("state"),
  });
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Callback inválido (code/state ausentes)." }, { status: 400 });
  }

  if (debug) {
    console.log("[ml-oauth][callback] received", {
      hasCode: Boolean(parsed.data.code),
      hasState: Boolean(parsed.data.state),
    });
  }

  const jar = await cookies();
  const expected = jar.get(STATE_COOKIE)?.value ?? "";
  const received = parsed.data.state;

  if (debug) {
    console.log("[ml-oauth][callback] query", {
      receivedStatePreview: received.slice(0, 6) + "…" + received.slice(-4),
      cookieHeaderPreview: req.headers.get("cookie")?.slice(0, 160) ?? null,
      storedCookiePreview: expected ? expected.slice(0, 6) + "…" + expected.slice(-4) : null,
    });
  }

  // 1) valida contra cookie (rápido) — mas não apaga ainda
  const cookieOk = expected && received === expected;

  // 2) valida/consome server-side (uso único + expiração)
  const stateConsumed = await consumeOAuthState(received);

  // Agora sim apaga cookie (uso único / evitar replay)
  const clearCookie = () => {
    jar.set(STATE_COOKIE, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/api/ml",
      maxAge: 0,
    });
  };

  // Se o store server-side estiver indisponível (migration não aplicada / PostgREST indisponível),
  // não derruba o fluxo: valida pelo cookie para evitar falso "state inválido".
  const storeRequired = stateConsumed.reason !== "store_error";
  const stateOk = storeRequired ? stateConsumed.ok : true;

  if (!cookieOk || !stateOk) {
    clearCookie();
    if (debug) {
      return NextResponse.json(
        {
          success: false,
          error: "State inválido",
          receivedState: received,
          storedStateExists: Boolean(expected),
          storedStatePreview: expected ? expected.slice(0, 6) + "…" + expected.slice(-4) : null,
          cookieOk,
          stateStoreOk: stateConsumed.ok,
          stateStoreReason: stateConsumed.reason ?? null,
          stateStoreRequired: storeRequired,
        },
        { status: 400 },
      );
    }
    return NextResponse.json({ success: false, error: "State inválido. Tente autorizar novamente." }, { status: 400 });
  }

  clearCookie();

  if (debug) console.log("[ml-oauth][callback] state_validated", { cookieOk: true, stateStoreOk: stateConsumed.ok });

  try {
    console.log("[ml-oauth][callback] token_endpoint", { url: getMercadoLivreTokenEndpointUrl() });

    const token = await exchangeCodeForToken(parsed.data.code);
    const userId = String(token.user_id);

    console.log("[ml-oauth][callback] token_exchange_ok", {
      userId,
      token_type: token.token_type ?? "bearer",
      expires_in: token.expires_in,
      scope: token.scope ?? null,
    });

    try {
      console.log("[ml-oauth][callback] persist_token:start", { userId });
      await upsertMlToken({
        user_id: userId,
        access_token: token.access_token,
        refresh_token: token.refresh_token,
        token_type: token.token_type ?? "bearer",
        scope: token.scope ?? null,
        expires_in: token.expires_in,
        expires_at: computeExpiresAt(token.expires_in),
      });
      console.log("[ml-oauth][callback] persist_token:done", { userId });
    } catch (e) {
      console.error("[ml-oauth][callback] persist_token_failed", e);
      const dbStatus = e instanceof PostgrestError ? e.status : undefined;
      return NextResponse.json(
        {
          success: false,
          error: "Falha ao salvar tokens no banco",
          dbStatus,
          detail: debug ? (e instanceof PostgrestError ? e.details ?? e.message : e instanceof Error ? e.message : e) : undefined,
        },
        { status: 500 },
      );
    }

    const row = await getMlTokenByUserId(userId);
    if (debug) {
      console.log("[ml-oauth][callback] token_saved", {
        userId,
        saved: Boolean(row?.access_token && row?.refresh_token && row?.expires_at),
        expires_at: row?.expires_at ?? null,
        token_type: row?.token_type ?? null,
        scope: row?.scope ?? null,
        updated_at: row?.updated_at ?? null,
      });
    }

    const wantsJson =
      searchParams.get("format") === "json" ||
      req.headers.get("accept")?.includes("application/json") === true;

    if (wantsJson) {
      return NextResponse.json({ success: true, message: "Autorização concluída com sucesso" });
    }

    return NextResponse.redirect(new URL("/admin/mercadolivre?oauth=success", req.url));
  } catch (e) {
    console.error("[ml-oauth][callback] token_exchange_or_persist_failed", e);
    const externalStatus = e instanceof MercadoLivreError ? e.status : undefined;
    const dbStatus = e instanceof PostgrestError ? e.status : undefined;
    const detail = debug
      ? e instanceof MercadoLivreError
        ? e.details ?? e.message
        : e instanceof Error
          ? e.message
          : e
      : undefined;
    const status = externalStatus ?? dbStatus ?? 500;
    return NextResponse.json(
      {
        success: false,
        error: "Falha ao trocar code por token",
        externalStatus,
        dbStatus,
        detail,
      },
      { status },
    );
  }
}

