import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession } from "@/lib/admin/auth";
import { consumeOAuthState } from "@/lib/mercadolivre/oauth-state-store";
import { exchangeCodeForToken, computeExpiresAt } from "@/lib/mercadolivre/oauth";
import { upsertMlToken } from "@/lib/mercadolivre/token-store";
import { serializeError } from "@/lib/mercadolivre/oauth-debug";

export const runtime = "nodejs";

const schema = z.object({
  code: z.string().min(3),
  state: z.string().min(10),
});

export async function GET(req: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  }

  const url = new URL(req.url);
  const parsed = schema.safeParse({
    code: url.searchParams.get("code"),
    state: url.searchParams.get("state"),
  });
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Callback inválido (code/state ausentes).", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const consumed = await consumeOAuthState(parsed.data.state);
  if (!consumed.ok) {
    return NextResponse.json(
      { ok: false, error: `State inválido (${consumed.reason}).`, details: consumed.storeError ? serializeError(consumed.storeError) : undefined },
      { status: 400 },
    );
  }

  try {
    const token = await exchangeCodeForToken(parsed.data.code);
    await upsertMlToken({
      user_id: String(token.user_id),
      access_token: token.access_token,
      refresh_token: token.refresh_token,
      token_type: token.token_type ?? "bearer",
      scope: token.scope ?? null,
      expires_in: token.expires_in,
      expires_at: computeExpiresAt(token.expires_in),
    });
  } catch (e) {
    const details = serializeError(e);
    const debugJson = {
      ok: false,
      error: "Falha ao trocar code por token e persistir.",
      details,
      env: {
        MERCADOLIVRE_CLIENT_ID: Boolean(process.env.MERCADOLIVRE_CLIENT_ID),
        MERCADOLIVRE_CLIENT_SECRET: Boolean(process.env.MERCADOLIVRE_CLIENT_SECRET),
        MERCADOLIVRE_REDIRECT_URI: process.env.MERCADOLIVRE_REDIRECT_URI ?? null,
        MERCADOLIVRE_AUTH_URL: process.env.MERCADOLIVRE_AUTH_URL ?? null,
        MERCADOLIVRE_API_URL: process.env.MERCADOLIVRE_API_URL ?? null,
        DATABASE_URL: Boolean(process.env.DATABASE_URL),
        POSTGRES_URL: Boolean(process.env.POSTGRES_URL),
        PGSSLMODE: process.env.PGSSLMODE ?? null,
      },
    };
    const pretty = JSON.stringify(debugJson, null, 2);
    const html = `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>ML OAuth Callback — Debug</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; padding: 16px; color: #111827; background: #f9fafb; }
      .card { max-width: 980px; margin: 0 auto; background: white; border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; }
      h1 { font-size: 18px; margin: 0 0 8px; }
      p { margin: 8px 0; color: #374151; }
      pre { margin-top: 12px; padding: 12px; background: #0b1020; color: #e5e7eb; border-radius: 10px; overflow: auto; }
      code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; font-size: 12px; }
      .hint { font-size: 13px; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Falha no callback OAuth do Mercado Livre</h1>
      <p class="hint">Copie o JSON abaixo e envie para suporte/dev. (Este endpoint está em modo debug.)</p>
      <pre><code>${pretty.replace(/</g, "&lt;")}</code></pre>
      <p class="hint">Dicas rápidas: verifique <code>MERCADOLIVRE_REDIRECT_URI</code> (deve bater com o app do ML) e se o servidor tem <code>DATABASE_URL</code>/<code>POSTGRES_URL</code>.</p>
    </div>
  </body>
</html>`;
    return new NextResponse(html, {
      status: 500,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  return NextResponse.redirect("/admin/importacao?ml_oauth=ok");
}

