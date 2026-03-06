import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";
import { adminCountExpiredAffiliateProducts } from "@/lib/admin/db";

export const runtime = "nodejs";

export async function GET() {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  try {
    const count = await adminCountExpiredAffiliateProducts();
    return NextResponse.json({ count });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "Erro ao contar links expirados." },
      { status: 500 },
    );
  }
}
