import { NextResponse } from "next/server";
import { z } from "zod";
import { adminListCategories, adminCreateCategory } from "@/lib/admin/db";

export const runtime = "nodejs";

const createSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório").max(200),
  slug: z.string().max(200).optional().nullable(),
  parent_id: z.string().uuid().optional().nullable(),
  show_in_header: z.boolean().optional(),
});

export async function GET() {
  try {
    const list = await adminListCategories();
    return NextResponse.json(list);
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { ok: false, error: "Erro ao listar categorias." },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      const msg = parsed.error.flatten().fieldErrors?.name?.[0] ?? "Dados inválidos.";
      return NextResponse.json({ ok: false, error: msg }, { status: 400 });
    }
    const created = await adminCreateCategory(parsed.data);
    return NextResponse.json(created);
  } catch (e: any) {
    const msg = e?.message ?? "Erro ao criar categoria.";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
