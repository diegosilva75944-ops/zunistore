import { NextResponse } from "next/server";
import { z } from "zod";
import { adminTopSearches } from "@/services/personalization/analytics-admin";

export const runtime = "nodejs";

const q = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const parsed = q.safeParse({ limit: url.searchParams.get("limit") ?? undefined });
    const limit = parsed.success ? (parsed.data.limit ?? 30) : 30;
    const items = await adminTopSearches(limit);
    return NextResponse.json({ ok: true, items });
  } catch (e) {
    console.error("[admin/analytics/top-searches]", e);
    return NextResponse.json({ ok: false, error: "Falha ao agregar." }, { status: 500 });
  }
}
