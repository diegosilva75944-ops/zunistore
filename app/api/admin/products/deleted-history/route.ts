import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";
import { adminListDeletedProductsHistory } from "@/lib/admin/db";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
    const perPageParam = searchParams.get("perPage");
    const perPage = [10, 20, 50].includes(Number(perPageParam))
      ? Number(perPageParam)
      : 20;

    const { items, total } = await adminListDeletedProductsHistory({
      page,
      perPage,
    });

    return NextResponse.json({ items, total, page, perPage });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "Erro ao listar histórico de deletados." },
      { status: 500 },
    );
  }
}
