import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");

  // Só pra testar que o callback está funcionando.
  // Depois a gente troca por: trocar code -> tokens e salvar no Supabase.
  return NextResponse.json({ ok: true, code });
}