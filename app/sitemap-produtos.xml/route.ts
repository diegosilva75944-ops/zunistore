import { NextResponse } from "next/server";
import { postgrestGet } from "@/lib/postgrest/server";
import { applyAffiliateVisibleToProductParams } from "@/lib/store";

export const runtime = "nodejs";

function isAffiliateColumnError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /42703|affiliate_valid|PGRST204|does not exist|column/i.test(msg);
}

export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  const baseParams: Record<string, string> = {
    select: "code6,slug,updated_at",
    is_active: "eq.true",
    order: "created_at.desc",
    limit: "5000",
  };
  let data: any[];
  try {
    const params = { ...baseParams };
    applyAffiliateVisibleToProductParams(params);
    data = await postgrestGet<any[]>("products", params, "anon");
  } catch (e) {
    if (!isAffiliateColumnError(e)) throw e;
    data = await postgrestGet<any[]>("products", baseParams, "anon");
  }

  const urls = (Array.isArray(data) ? data : []).map((p) => ({
    loc: `${origin}/produto/${p.code6}/${p.slug}`,
    lastmod: p.updated_at ? new Date(p.updated_at).toISOString() : null,
  }));

  return xmlUrlset(urls);
}

function xmlUrlset(urls: { loc: string; lastmod: string | null }[]) {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) =>
      `  <url><loc>${escapeXml(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}</url>`,
  )
  .join("\n")}
</urlset>`;
  return new NextResponse(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}

function escapeXml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

