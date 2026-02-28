import { NextResponse } from "next/server";
import { z } from "zod";
import { adminGetSiteSettings, adminUpdateLogoUrl, adminUpdateSiteColors } from "@/lib/admin/db";

export const runtime = "nodejs";

export async function GET() {
  const settings = await adminGetSiteSettings();
  return NextResponse.json({ ok: true, settings });
}

const schema = z.object({
  logo_url: z.string().url().nullable().optional(),
  colors: z.record(z.string(), z.string()).optional(),
});

export async function PATCH(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Payload inválido." }, { status: 400 });
  }

  if (parsed.data.colors) {
    await adminUpdateSiteColors(parsed.data.colors);
  }
  if (parsed.data.logo_url !== undefined) {
    await adminUpdateLogoUrl(parsed.data.logo_url);
  }

  return NextResponse.json({ ok: true });
}

