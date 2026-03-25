import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";
import { adminListPriceHistory, adminPurgePriceHistory } from "@/lib/admin/db";

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
    const perPage = [10, 20, 50].includes(Number(perPageParam)) ? Number(perPageParam) : 20;
    const dateFrom = searchParams.get("dateFrom")?.trim() || undefined;
    const dateTo = searchParams.get("dateTo")?.trim() || undefined;
    const categoryId = searchParams.get("categoryId")?.trim() || undefined;

    const { items, total } = await adminListPriceHistory({
      page,
      perPage,
      dateFrom,
      dateTo,
      categoryId,
    });
    return NextResponse.json({ items, total, page, perPage });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "Erro ao listar histórico de preços." },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as {
      deleteAll?: boolean;
      dateFrom?: string | null;
      dateTo?: string | null;
      categoryId?: string | null;
    };
    const deleteAll = body.deleteAll === true;
    const dateFrom =
      typeof body.dateFrom === "string" && body.dateFrom.trim()
        ? body.dateFrom.trim()
        : null;
    const dateTo =
      typeof body.dateTo === "string" && body.dateTo.trim() ? body.dateTo.trim() : null;
    const categoryId =
      typeof body.categoryId === "string" && body.categoryId.trim()
        ? body.categoryId.trim()
        : null;

    const deleted = await adminPurgePriceHistory({
      deleteAll,
      dateFrom,
      dateTo,
      categoryId,
    });
    return NextResponse.json({ ok: true, deleted });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro ao apagar histórico.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
