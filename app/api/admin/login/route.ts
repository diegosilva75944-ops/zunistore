import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { setAdminSessionCookie } from "@/lib/admin/auth";

export const runtime = "nodejs";

const bodySchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Payload inválido." }, { status: 400 });
  }

  const supabase = getSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from("admin_users")
    .select("id, username, password_hash")
    .eq("username", parsed.data.username)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ ok: false, error: "Usuário ou senha inválidos." }, { status: 401 });
  }

  const ok = await bcrypt.compare(parsed.data.password, data.password_hash);
  if (!ok) {
    return NextResponse.json({ ok: false, error: "Usuário ou senha inválidos." }, { status: 401 });
  }

  await setAdminSessionCookie({ sub: data.id, username: data.username });
  return NextResponse.json({ ok: true });
}

