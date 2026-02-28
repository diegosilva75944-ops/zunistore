import { NextResponse } from "next/server";
import { z } from "zod";
import { adminGetContactSettings, adminUpdateContactSettings } from "@/lib/admin/db";

export const runtime = "nodejs";

export async function GET() {
  const settings = await adminGetContactSettings();
  return NextResponse.json({ ok: true, settings });
}

const schema = z.object({
  address: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
});

export async function PATCH(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Payload inválido." }, { status: 400 });
  }
  await adminUpdateContactSettings(parsed.data);
  return NextResponse.json({ ok: true });
}

