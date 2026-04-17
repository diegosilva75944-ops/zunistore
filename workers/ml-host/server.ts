/**
 * Worker HTTP no host (fora do Docker): executa `runTestMlImportCore` com Playwright/X11 reais.
 *
 * Arranque (na raiz do repo, no mesmo ambiente que o `.env` com ML/Playwright):
 *   npx tsx workers/ml-host/server.ts
 *
 * Ver workers/ml-host/README.md
 */
import "dotenv/config";
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
    const u = new URL(raw, "http://127.0.0.1");
    return (u.pathname || "/").replace(/\/+$/, "") || "/";
  } catch {
    return (raw.split("?")[0] ?? "/").replace(/\/+$/, "") || "/";
  }
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
  const listenHost = String(process.env.ML_HOST_IMPORT_LISTEN_HOST ?? "0.0.0.0").trim() || "0.0.0.0";
  const port = Number(process.env.ML_HOST_IMPORT_PORT ?? "3847") || 3847;

  if (!secret && listenHost === "0.0.0.0") {
    console.warn(
      "[ml-host-worker] AVISO: ML_HOST_IMPORT_SECRET vazio e escuta em 0.0.0.0 — qualquer cliente na rede pode chamar o import. Use 127.0.0.1 ou defina um segredo.",
    );
  }

  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === "GET" && requestPathname(req) === "/health") {
        json(res, 200, { ok: true, service: "zunistore-ml-host" });
        return;
      }

      const pathname = requestPathname(req);

      if (req.method === "POST" && pathname === "/internal/ml-login-open") {
        if (secret) {
          const auth = String(req.headers.authorization ?? "").trim();
          const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
          if (token !== secret) {
            json(res, 401, { ok: false, error: "Não autorizado." });
            return;
          }
        }
        await respondMlLoginOpen(res);
        return;
      }

      if (req.method !== "POST" || pathname !== "/internal/ml-import") {
        json(res, 404, { ok: false, error: "Não encontrado." });
        return;
      }

      if (secret) {
        const auth = String(req.headers.authorization ?? "").trim();
        const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
        if (token !== secret) {
          json(res, 401, { ok: false, error: "Não autorizado." });
          return;
        }
      }

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
    } catch (e) {
      const message = e instanceof Error ? e.message : "Erro interno.";
      json(res, 422, { ok: false, error: message });
    }
  });

  server.listen(port, listenHost, () => {
    const authHint = secret ? "auth=Bearer" : "auth=desligado";
    console.info(
      `[ml-host-worker] http://${listenHost}:${port}  health=GET /health  import=POST /internal/ml-import  login=POST /internal/ml-login-open  (${authHint})`,
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
