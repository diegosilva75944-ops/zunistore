import { getAdminSession } from "@/lib/admin/auth";
import { runCronMlFullReimportAll } from "@/services/mercadolivre/cron-ml-reimport";

export const runtime = "nodejs";
export const maxDuration = 900;

function jsonFromBatch(result: Awaited<ReturnType<typeof runCronMlFullReimportAll>>) {
  if (!result.ok) {
    return {
      ok: false as const,
      mode: "ml_full_reimport" as const,
      error: result.error,
    };
  }
  if (result.skipped) {
    return {
      ok: true as const,
      mode: "ml_full_reimport" as const,
      skipped: true,
      reason: result.reason,
      total: result.total,
      reimported: result.reimported,
      deleted: result.deleted,
      failed: result.failed,
      skipped_no_url: result.skipped_no_url,
      failures: result.failures.slice(0, 40),
      dedupe_removed: result.dedupe_removed ?? 0,
      dedupe_errors: (result.dedupe_errors ?? []).slice(0, 20),
    };
  }
  return {
    ok: true as const,
    mode: "ml_full_reimport" as const,
    skipped: false,
    total: result.total,
    reimported: result.reimported,
    deleted: result.deleted,
    failed: result.failed,
    skipped_no_url: result.skipped_no_url,
    failures: result.failures.slice(0, 40),
    updated: result.reimported,
    skipped_legacy: 0,
    dedupe_removed: result.dedupe_removed,
    dedupe_errors: result.dedupe_errors.slice(0, 20),
  };
}

export async function POST(_req: Request) {
  const session = await getAdminSession();
  if (!session) {
    return new Response(JSON.stringify({ ok: false, error: "Não autenticado." }), {
      status: 401,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const writeLine = (obj: unknown) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`));
      };
      try {
        const result = await runCronMlFullReimportAll({
          onProgress: async (evt) => {
            writeLine({ type: "progress", ...evt });
          },
        });
        writeLine({ type: "complete", result: jsonFromBatch(result) });
      } catch (e) {
        writeLine({
          type: "error",
          message: e instanceof Error ? e.message : String(e),
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
