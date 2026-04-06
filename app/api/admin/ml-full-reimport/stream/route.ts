import { getAdminSession } from "@/lib/admin/auth";
import {
  mlAdminFullPipelineResultToJson,
  runMlAdminFullPipeline,
} from "@/services/mercadolivre/ml-admin-full-pipeline";

export const runtime = "nodejs";
export const maxDuration = 900;

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
        const result = await runMlAdminFullPipeline({
          onProgress: async (evt) => {
            writeLine({ type: "progress", ...evt });
          },
        });
        writeLine({ type: "complete", result: mlAdminFullPipelineResultToJson(result) });
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
