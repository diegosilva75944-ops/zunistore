import { NextResponse } from "next/server";
import { adminListMercadolivreProductsForBrowserSync } from "@/lib/admin/db";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
    const perPageRaw = parseInt(searchParams.get("perPage") ?? "20", 10) || 20;
    const perPage = Math.min(50, Math.max(5, perPageRaw));
    const q = searchParams.get("q")?.trim() ?? null;

    const { items, total, page: p, perPage: pp } =
      await adminListMercadolivreProductsForBrowserSync({
        page,
        perPage,
        q,
      });

    return NextResponse.json({ items, total, page: p, perPage: pp });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "Erro ao listar produtos Mercado Livre." },
      { status: 500 },
    );
  }
}
