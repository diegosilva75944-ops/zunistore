import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";

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

  const supabase = getSupabaseServiceRoleClient();
  await supabase.from("seo_queries").update(parsed.data.patch).in("id", parsed.data.ids);
  return NextResponse.json({ ok: true });
}

