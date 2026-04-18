/**
 * Worker HTTP no host (fora do Docker): executa `runTestMlImportCore` com Playwright/X11 reais.
 *
 * Arranque (na raiz do repo, no mesmo ambiente que o `.env` com ML/Playwright):
 *   npx tsx workers/ml-host/server.ts
 *
 * Ver workers/ml-host/README.md
 */
import "dotenv/config";
import crypto from "node:crypto";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runTestMlImportCore } from "@/lib/ml-test/pipeline";
import type { ImportMode } from "@/lib/ml-test/types";
import type { RunTestMlImportOptions } from "@/lib/ml-test/pipeline";
import { openMercadoLivreLoginWindow } from "@/lib/ml-test/extractWithBrowser";
import { readFileSync } from "node:fs";

/** Evita `openMercadoLivreLoginWindow` delegar de volta ao ML_HOST_IMPORT_URL neste processo. */
process.env.ML_HOST_IS_WORKER = "1";

const MODES = new Set<string>(["auto", "html", "headless"]);

function json(res: http.ServerResponse, status: number, body: unknown) {
  const s = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(s);
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c as Buffer));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function requestPathname(req: http.IncomingMessage): string {
  const raw = req.url ?? "/";
  try {
    const u = new URL(raw, "http://internal.ml-host.invalid");
    return (u.pathname || "/").replace(/\/+$/, "") || "/";
  } catch {
    return (raw.split("?")[0] ?? "/").replace(/\/+$/, "") || "/";
  }
}

/**
 * Autenticação Bearer para rotas `/internal/*`.
 * - `ML_HOST_IMPORT_SECRET` vazio: acesso permitido (modo dev; ver log de arranque).
 * - Com segredo: exige `Authorization: Bearer <token>` igual ao segredo.
 */
export function validateInternalAuth(
  req: http.IncomingMessage,
  secret: string,
): { ok: true } | { ok: false; reason: "missing_header" | "invalid_token" } {
  const trimmed = secret.trim();
  if (!trimmed) {
    return { ok: true };
  }

  const auth = String(req.headers.authorization ?? "").trim();
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";

  if (!token) {
    return { ok: false, reason: "missing_header" };
  }

  const a = Buffer.from(token, "utf8");
  const b = Buffer.from(trimmed, "utf8");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, reason: "invalid_token" };
  }

  return { ok: true };
}

function logAuthFailure(reason: "missing_header" | "invalid_token"): void {
  const hint =
    reason === "missing_header" ?
      "header Authorization Bearer ausente ou formato inválido"
    : "token não coincide com ML_HOST_IMPORT_SECRET";
  console.warn(`[ml-host-worker] Auth falhou (${hint}).`);
}

async function respondMlLoginOpen(res: http.ServerResponse): Promise<void> {
  const result = await openMercadoLivreLoginWindow();
  if (!result.ok) {
    json(res, 422, { ok: false, error: result.error, details: result.details ?? undefined });
    return;
  }
  const abs = path.resolve(process.cwd(), result.storageStatePath);
  let storageState: unknown;
  try {
    storageState = JSON.parse(readFileSync(abs, "utf8")) as unknown;
  } catch (e) {
    const message = e instanceof Error ? e.message : "falha ao ler storage state";
    json(res, 422, { ok: false, error: `Após login: ${message}` });
    return;
  }
  json(res, 200, {
    ok: true,
    storageState,
    userDataDir: result.userDataDir,
    storageStatePath: result.storageStatePath,
  });
}

export async function createMlHostWorkerServer(): Promise<http.Server> {
  const secret = String(process.env.ML_HOST_IMPORT_SECRET ?? "").trim();
  const port = Number(process.env.ML_HOST_IMPORT_PORT ?? "3847") || 3847;
  const host = String(process.env.ML_HOST_IMPORT_LISTEN_HOST ?? "0.0.0.0").trim() || "0.0.0.0";

  if (!secret) {
    console.warn(
      "[ml-host-worker] AVISO: ML_HOST_IMPORT_SECRET vazio — autenticação DESATIVADA em /internal/* (modo dev). Defina um segredo em produção.",
    );
  } else {
    console.info("[ml-host-worker] Autenticação Bearer obrigatória para POST /internal/ml-import e POST /internal/ml-login-open.");
  }

  if (!secret && host !== "127.0.0.1" && host !== "::1") {
    console.warn(
      "[ml-host-worker] AVISO: segredo vazio e escuta em rede — qualquer cliente pode chamar o worker.",
    );
  }

  const server = http.createServer(async (req, res) => {
    try {
      const pathname = requestPathname(req);

      if (req.method === "GET" && pathname === "/health") {
        json(res, 200, { ok: true, service: "zunistore-ml-host" });
        return;
      }

      if (pathname.startsWith("/internal/")) {
        const authResult = validateInternalAuth(req, secret);
        if (!authResult.ok) {
          logAuthFailure(authResult.reason);
          json(res, 401, { ok: false, error: "Não autorizado." });
          return;
        }

        if (req.method === "POST" && pathname === "/internal/ml-login-open") {
          await respondMlLoginOpen(res);
          return;
        }

        if (req.method === "POST" && pathname === "/internal/ml-import") {
          const raw = await readBody(req);
          let body: { url?: string; mode?: string; opts?: RunTestMlImportOptions; mlLoginOpen?: boolean };
          try {
            body = JSON.parse(raw) as typeof body;
          } catch {
            json(res, 400, { ok: false, error: "JSON inválido." });
            return;
          }

          if (body.mlLoginOpen === true) {
            await respondMlLoginOpen(res);
            return;
          }

          const url = String(body.url ?? "").trim();
          const mode = String(body.mode ?? "auto").trim();
          if (!url || !MODES.has(mode)) {
            json(res, 400, { ok: false, error: "url ou mode inválido." });
            return;
          }

          const result = await runTestMlImportCore(url, mode as ImportMode, body.opts);
          json(res, 200, { ok: true, result });
          return;
        }

        json(res, 404, { ok: false, error: "Não encontrado." });
        return;
      }

      json(res, 404, { ok: false, error: "Não encontrado." });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Erro interno.";
      json(res, 422, { ok: false, error: message });
    }
  });

  server.listen(port, host, () => {
    const authHint = secret ? "auth=Bearer obrigatório em /internal/*" : "auth=desligado (modo dev)";
    console.info(`[ml-host-worker] listening on http://${host}:${port}`);
    console.info(
      `[ml-host-worker] health=GET /health (sem auth)  import=POST /internal/ml-import  login=POST /internal/ml-login-open  (${authHint})`,
    );
  });

  return server;
}

const isMain =
  typeof process.argv[1] === "string" &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  void createMlHostWorkerServer().catch((e) => {
    console.error("[ml-host-worker]", e);
    process.exit(1);
  });
}
