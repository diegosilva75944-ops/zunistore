import { NextResponse } from "next/server";
import { buildAffiliateUrlFromInput } from "@/lib/affiliate";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const input = body?.item || body?.itemId || body?.url;

  if (!input || typeof input !== "string") {
    return NextResponse.json(
      { error: "Informe o ID ou URL do produto em `item`." },
      { status: 400 }
    );
  }

  try {
    const affiliateUrl = buildAffiliateUrlFromInput(input);
    return NextResponse.json({ affiliateUrl });
  } catch (error: any) {
    console.error(error);
    return NextResponse.json(
      { error: error?.message ?? "Erro ao gerar link de afiliado." },
      { status: 500 }
    );
  }
}

