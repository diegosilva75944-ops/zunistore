import { NextResponse } from "next/server";
import { z } from "zod";
import {
  adminGetSiteSettings,
  adminUpdateLogoUrl,
  adminUpdateSiteColors,
  adminUpdateOffersSectionPosition,
} from "@/lib/admin/db";

export const runtime = "nodejs";

export async function GET() {
  const settings = await adminGetSiteSettings();
  return NextResponse.json({ ok: true, settings });
}

/** Evita 400 quando o logo não é URL absoluta (ex.: caminho relativo ou storage). */
const optionalLogoUrl = z
  .union([z.string(), z.null()])
  .optional()
  .transform((s) => {
    if (s === undefined) return undefined;
    if (s === null || String(s).trim() === "") return null;
    return String(s).trim();
  });

const schema = z.object({
  logo_url: optionalLogoUrl,
  colors: z.record(z.string(), z.string()).optional(),
  offers_section_position: z.enum(["after_hero", "before_hero"]).optional(),
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
    const v = parsed.data.logo_url;
    await adminUpdateLogoUrl(v === "" || v === null ? null : v);
  }
  if (parsed.data.offers_section_position) {
    await adminUpdateOffersSectionPosition(parsed.data.offers_section_position);
  }

  return NextResponse.json({ ok: true });
}

