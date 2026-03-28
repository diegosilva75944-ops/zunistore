import { NextResponse } from "next/server";
import { z } from "zod";
import { adminListCategories, adminUpdateCategory, adminDeleteCategory } from "@/lib/admin/db";

export const runtime = "nodejs";

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  slug: z.string().max(200).optional(),
  show_in_header: z.boolean().optional(),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const list = await adminListCategories();
    const one = list.find((c: any) => c.id === id);
    if (!one) return NextResponse.json({ error: "Categoria não encontrada." }, { status: 404 });
    return NextResponse.json(one);
  } catch (e) {
    return NextResponse.json({ error: "Erro ao buscar categoria." }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "Dados inválidos." }, { status: 400 });
    }
    await adminUpdateCategory(id, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Erro ao atualizar." }, { status: 400 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    await adminDeleteCategory(id);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Não foi possível excluir a categoria." },
      { status: 400 }
    );
  }
}
