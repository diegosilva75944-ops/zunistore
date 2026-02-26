import { NextResponse } from "next/server";

export async function GET() {
  const clientId = process.env.ML_CLIENT_ID;
  const redirectUri = process.env.ML_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return NextResponse.json(
      { error: "Faltam ML_CLIENT_ID ou ML_REDIRECT_URI nas variáveis de ambiente." },
      { status: 500 }
    );
  }

  const url =
    `https://auth.mercadolivre.com.br/authorization` +
    `?response_type=code` +
    `&client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}`;

  return NextResponse.redirect(url);
}