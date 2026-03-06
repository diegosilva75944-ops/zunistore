import { NextResponse } from "next/server";
import { adminListProducts } from "@/lib/admin/db";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
    const perPageParam = searchParams.get("perPage");
    const perPage = [10, 20, 50].includes(Number(perPageParam))
      ? Number(perPageParam)
      : 20;
    const q = searchParams.get("q")?.trim() ?? null;
    const code6 = searchParams.get("code6")?.trim() ?? null;
    const categoryId = searchParams.get("categoryId")?.trim() || null;
    const affiliateExpired = searchParams.get("affiliateExpired") === "true";

    const { items, total } = await adminListProducts({
      page,
      perPage,
      q: q || null,
      code6: code6 || null,
      categoryId: categoryId || null,
      affiliateExpired: affiliateExpired || null,
    });

    return NextResponse.json({ items, total, page, perPage });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "Erro ao listar produtos." },
      { status: 500 }
    );
  }
}
