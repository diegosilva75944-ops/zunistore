import { NextResponse } from "next/server";
import { upsertProductFromMl } from "@/lib/ml";

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
    const product = await upsertProductFromMl(input);
    return NextResponse.json({ product });
  } catch (error: any) {
    console.error(error);
    return NextResponse.json(
      { error: error?.message ?? "Erro ao sincronizar produto." },
      { status: 500 }
    );
  }
}

