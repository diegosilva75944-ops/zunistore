import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";
import { checkMercadoLivreOAuthEnv } from "@/lib/mercadolivre/oauth-env";
import { createOAuthState } from "@/lib/mercadolivre/oauth-state-store";

export const runtime = "nodejs";

export async function GET() {
  /**
   * Mantido por compatibilidade. Endpoint canônico:
   * - /api/ml/auth
   */
  return NextResponse.redirect("/api/ml/auth");
}

