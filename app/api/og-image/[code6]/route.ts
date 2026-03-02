import { NextResponse } from "next/server";
import { getProductByCode6 } from "@/lib/store";

export const runtime = "nodejs";

/** Serve a imagem principal do produto no nosso domínio para Facebook/WhatsApp exibirem no preview. */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ code6: string }> },
) {
  const { code6 } = await ctx.params;
  if (!code6 || code6.length !== 6) {
    return new NextResponse(null, { status: 404 });
  }

  const product = await getProductByCode6(code6);
  const imageUrl = product?.images?.[0];
  if (!imageUrl || typeof imageUrl !== "string" || !imageUrl.startsWith("http")) {
    return new NextResponse(null, { status: 404 });
  }

  try {
    const res = await fetch(imageUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "image/webp,image/apng,image/*,*/*;q=0.8",
      },
      redirect: "follow",
    });
    if (!res.ok) return new NextResponse(null, { status: 404 });
    const contentType = res.headers.get("content-type") || "image/jpeg";
    const blob = await res.arrayBuffer();
    return new NextResponse(blob, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, s-maxage=86400",
      },
    });
  } catch {
    return new NextResponse(null, { status: 502 });
  }
}
