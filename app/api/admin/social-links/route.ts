import { NextResponse } from "next/server";
import { z } from "zod";
import { adminListSocialLinks, adminUpsertSocialLink } from "@/lib/admin/db";

export const runtime = "nodejs";

export async function GET() {
  const items = await adminListSocialLinks();
  return NextResponse.json({ ok: true, items });
}

const schema = z.object({
  icon: z.string().min(1).max(40),
  url: z.string().url(),
  color: z.string().nullable().optional(),
  sort_order: z.coerce.number().int().optional(),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Payload inválido." }, { status: 400 });
  }
  await adminUpsertSocialLink(parsed.data);
  return NextResponse.json({ ok: true });
}

