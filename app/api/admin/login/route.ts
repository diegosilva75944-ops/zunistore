import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { postgrestGet } from "@/lib/postgrest/server";
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

  let data: { id: string; username: string; password_hash: string } | null = null;
  try {
    const rows = await postgrestGet<{ id: string; username: string; password_hash: string }[]>(
      "admin_users",
      {
        select: "id,username,password_hash",
        username: `eq.${encodeURIComponent(parsed.data.username)}`,
        limit: "1",
      },
      "service",
    );
    const arr = Array.isArray(rows) ? rows : [];
    data = arr[0] ?? null;
  } catch {
    return NextResponse.json({ ok: false, error: "Usuário ou senha inválidos." }, { status: 401 });
  }

  if (!data) {
    return NextResponse.json({ ok: false, error: "Usuário ou senha inválidos." }, { status: 401 });
  }

  const ok = await bcrypt.compare(parsed.data.password, data.password_hash);
  if (!ok) {
    return NextResponse.json({ ok: false, error: "Usuário ou senha inválidos." }, { status: 401 });
  }

  await setAdminSessionCookie({ sub: data.id, username: data.username });
  return NextResponse.json({ ok: true });
}

