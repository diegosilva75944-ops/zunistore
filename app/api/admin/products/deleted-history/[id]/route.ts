import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";
import { adminDeleteDeletedHistoryEntry } from "@/lib/admin/db";

export const runtime = "nodejs";

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }

  try {
    await adminDeleteDeletedHistoryEntry(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Erro ao apagar." },
      { status: 500 },
    );
  }
}
