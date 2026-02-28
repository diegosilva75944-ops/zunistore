import { NextResponse } from "next/server";
import { getSupabaseAnonServerClient } from "@/lib/supabase/server";
import { PRICE_RANGES } from "@/lib/priceRanges";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  const supabase = getSupabaseAnonServerClient();

  const { data: categories } = await supabase
    .from("categories")
    .select("slug, created_at")
    .is("parent_id", null)
    .limit(1000);

  const urls: { loc: string; lastmod: string | null }[] = [
    { loc: `${origin}/ofertas`, lastmod: null },
    { loc: `${origin}/novidades`, lastmod: null },
    { loc: `${origin}/mais-avaliados`, lastmod: null },
    { loc: `${origin}/maiores-descontos`, lastmod: null },
  ];

  for (const c of categories ?? []) {
    urls.push({ loc: `${origin}/ofertas/${c.slug}`, lastmod: c.created_at ? new Date(c.created_at).toISOString() : null });
    urls.push({ loc: `${origin}/mais-avaliados/${c.slug}`, lastmod: c.created_at ? new Date(c.created_at).toISOString() : null });
    for (const r of PRICE_RANGES) {
      urls.push({ loc: `${origin}/categoria/${c.slug}/${r.slug}`, lastmod: c.created_at ? new Date(c.created_at).toISOString() : null });
    }
  }

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

