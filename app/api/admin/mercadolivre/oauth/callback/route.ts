import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";
import { z } from "zod";
import { consumeOAuthState } from "@/lib/mercadolivre/oauth-state-store";
import { exchangeCodeForToken, computeExpiresAt } from "@/lib/mercadolivre/oauth";
import { upsertMlToken } from "@/lib/mercadolivre/token-store";

export const runtime = "nodejs";

const schema = z.object({
  code: z.string().min(3),
  state: z.string().min(10),
});

export async function GET(req: Request) {
  /** Compatibilidade: endpoint canônico é /api/ml/callback */
  const url = new URL(req.url);
  const qs = url.searchParams.toString();
  return NextResponse.redirect(`/api/ml/callback${qs ? `?${qs}` : ""}`);
}

