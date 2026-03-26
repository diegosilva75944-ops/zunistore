import { NextResponse } from "next/server";
import { z } from "zod";
import { mlSyncImportedProduct } from "@/services/mercadolivre/sync";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({
  productId: z.string().uuid(),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Payload inválido." }, { status: 400 });
  }

  try {
    const result = await mlSyncImportedProduct(parsed.data.productId);
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Erro ao sincronizar." },
      { status: 500 },
    );
  }
}

