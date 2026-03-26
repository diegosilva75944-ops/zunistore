import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { getAdminSession } from "@/lib/admin/auth";
import { exchangeCodeForToken, computeExpiresAt } from "@/lib/mercadolivre/oauth";
import { upsertMlToken } from "@/lib/mercadolivre/token-store";
import { consumeOAuthState } from "@/lib/mercadolivre/oauth-state-store";

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

  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse({
    code: searchParams.get("code"),
    state: searchParams.get("state"),
  });
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Callback inválido (code/state ausentes)." }, { status: 400 });
  }

  const jar = await cookies();
  const expected = jar.get(STATE_COOKIE)?.value ?? "";
  const received = parsed.data.state;
  const debug = process.env.NODE_ENV !== "production";

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

  const token = await exchangeCodeForToken(parsed.data.code);
  const userId = String(token.user_id);

  await upsertMlToken({
    user_id: userId,
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    token_type: token.token_type ?? "bearer",
    scope: token.scope ?? null,
    expires_in: token.expires_in,
    expires_at: computeExpiresAt(token.expires_in),
  });

  // redireciona de volta pro admin
  return NextResponse.redirect(new URL("/admin/mercadolivre", req.url));
}

