import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  const supabase = getSupabaseServiceRoleClient();
  const { data } = await supabase
    .from("carousel_items")
    .select("id, product_id, sort_order, size")
    .order("sort_order", { ascending: true });
  return NextResponse.json({ ok: true, items: data ?? [] });
}

const schema = z.object({
  items: z
    .array(
      z.object({
        product_id: z.string().uuid(),
        sort_order: z.number().int(),
        size: z.enum(["S", "M", "G"]),
      }),
    )
    .max(30),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Payload inválido." }, { status: 400 });
  }

  const supabase = getSupabaseServiceRoleClient();
  await supabase
    .from("carousel_items")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");

  if (parsed.data.items.length) {
    await supabase.from("carousel_items").insert(parsed.data.items);
  }

  return NextResponse.json({ ok: true });
}

