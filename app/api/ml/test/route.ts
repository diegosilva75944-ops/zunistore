import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";
import { getValidMercadoLivreAccessToken } from "@/lib/mercadolivre/get-valid-token";
import { mlApiGetJson } from "@/lib/mercadolivre/client";
import { MercadoLivreApiError } from "@/lib/mercadolivre/client";

export const runtime = "nodejs";

export async function GET() {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "Não autenticado." }, { status: 401 });
  }

  try {
    const t = await getValidMercadoLivreAccessToken();
    const me = await mlApiGetJson<Record<string, unknown>>({ path: `/users/${encodeURIComponent(t.user_id)}` });
    return NextResponse.json({
      success: true,
      userId: t.user_id,
      nickname: typeof me?.nickname === "string" ? me.nickname : null,
    });
  } catch (e) {
    if (e instanceof MercadoLivreApiError) {
      return NextResponse.json(
        { success: false, error: "Falha ao consultar Mercado Livre", externalStatus: e.externalStatus },
        { status: e.externalStatus },
      );
    }
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "Erro." }, { status: 500 });
  }
}

