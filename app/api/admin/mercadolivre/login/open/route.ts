import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";
import { openMercadoLivreLoginWindow } from "@/lib/ml-test/extractWithBrowser";

export const runtime = "nodejs";
export const revalidate = 0;
/** Pedido fica aberto até fechar a janela do Chromium no servidor. */
export const maxDuration = 3600;

export async function POST() {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  }

  const result = await openMercadoLivreLoginWindow();
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error, details: result.details ?? null },
      { status: 422 },
    );
  }

  return NextResponse.json({
    ok: true,
    userDataDir: result.userDataDir,
    storageStatePath: result.storageStatePath,
  });
}
