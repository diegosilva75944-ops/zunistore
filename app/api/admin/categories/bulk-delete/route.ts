import { NextResponse } from "next/server";
import { z } from "zod";
import { adminBulkDeleteCategories } from "@/lib/admin/db";

export const runtime = "nodejs";

const bodySchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
});

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "Lista de ids inválida." }, { status: 400 });
    }
    const result = await adminBulkDeleteCategories(parsed.data.ids);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { ok: false, error: "Erro ao processar exclusão em lote." },
      { status: 500 },
    );
  }
}
