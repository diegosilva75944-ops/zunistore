import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDeleteSocialLink, adminUpsertSocialLink } from "@/lib/admin/db";

export const runtime = "nodejs";

const schema = z.object({
  icon: z.string().min(1).max(40),
  url: z.string().url(),
  color: z.string().nullable().optional(),
  sort_order: z.coerce.number().int().optional(),
});

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Payload inválido." }, { status: 400 });
  }
  await adminUpsertSocialLink({ id, ...parsed.data });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  await adminDeleteSocialLink(id);
  return NextResponse.json({ ok: true });
}

