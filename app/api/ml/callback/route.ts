import { NextResponse } from "next/server";
import { exchangeCodeForToken } from "@/lib/ml";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.json({ error: "Sem code" }, { status: 400 });
  }

  try {
    await exchangeCodeForToken(code);
  } catch (error: any) {
    console.error("Erro no callback do Mercado Livre:", error);
    return NextResponse.json(
      {
        error: "Erro ao conectar com o Mercado Livre.",
        details: error?.message ?? String(error),
      },
      { status: 500 }
    );
  }

  const redirectTo = process.env.ML_CONNECTED_REDIRECT_URL || "/";
  return NextResponse.redirect(redirectTo);
}