import { NextResponse } from "next/server";
import { z } from "zod";
import { mlSyncImportedProductsBatch } from "@/services/mercadolivre/sync";

export const runtime = "nodejs";
export const maxDuration = 120;

const schema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(50),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Payload inválido." }, { status: 400 });
  }

  const results = await mlSyncImportedProductsBatch(parsed.data.ids, { delayMs: 350 });
  const okCount = results.filter((r) => r.ok).length;
  const failCount = results.length - okCount;
  return NextResponse.json({ ok: true, results, okCount, failCount });
}

