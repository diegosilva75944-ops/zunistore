import { NextResponse } from "next/server";
import { z } from "zod";
import { adminCreateToken, adminListTokens } from "@/lib/admin/db";

export const runtime = "nodejs";

export async function GET() {
  const tokens = await adminListTokens();
  return NextResponse.json({ ok: true, tokens });
}

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = z.object({ name: z.string().min(1).max(80) }).safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Nome inválido." }, { status: 400 });
  }
  const created = await adminCreateToken(parsed.data.name);
  return NextResponse.json({ ok: true, token: created.token, id: created.id });
}

