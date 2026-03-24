import { NextResponse } from "next/server";
import { z } from "zod";
import { postgrestPatch, inVal } from "@/lib/postgrest/server";

export const runtime = "nodejs";

const schema = z.object({
  ids: z.array(z.string().uuid()).min(1),
  patch: z.object({
    is_indexable: z.boolean().optional(),
    min_results: z.number().int().min(1).max(999).optional(),
  }),
});

export async function PATCH(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Payload inválido." }, { status: 400 });
  }
  await postgrestPatch("seo_queries", parsed.data.patch, { id: inVal(parsed.data.ids) });
  return NextResponse.json({ ok: true });
}

