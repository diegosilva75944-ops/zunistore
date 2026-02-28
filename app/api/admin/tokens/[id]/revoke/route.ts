import { NextResponse } from "next/server";
import { adminRevokeToken } from "@/lib/admin/db";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  await adminRevokeToken(id);
  return NextResponse.json({ ok: true });
}

