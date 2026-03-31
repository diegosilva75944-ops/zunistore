import { NextResponse } from "next/server";
import { z } from "zod";
import { assertMobileAppAuthorized, MobileAppAuthError } from "@/lib/mobile-app/auth";
import { listNextMlProductsForMobileSync } from "@/lib/mobile-app/ml-sync-queue";

export const runtime = "nodejs";

const querySchema = z.object({
  limit: z.coerce.number().min(1).max(50).optional().default(10),
});

export async function GET(req: Request) {
  try {
    assertMobileAppAuthorized(req);
    const url = new URL(req.url);
    const parsed = querySchema.safeParse({ limit: url.searchParams.get("limit") ?? undefined });
    const limit = parsed.success ? parsed.data.limit : 10;
    const items = await listNextMlProductsForMobileSync(limit);
    return NextResponse.json({ ok: true, items });
  } catch (e) {
    if (e instanceof MobileAppAuthError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    }
    console.error("[mobile/v1/sync/next]", e);
    return NextResponse.json({ ok: false, error: "Erro interno." }, { status: 500 });
  }
}
