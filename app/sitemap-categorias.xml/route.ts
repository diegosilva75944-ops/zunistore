import { NextResponse } from "next/server";
import { getSupabaseAnonServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  const supabase = getSupabaseAnonServerClient();

  const { data } = await supabase.from("categories").select("slug, created_at").limit(5000);
  const urls = (data ?? []).map((c: any) => ({
    loc: `${origin}/categoria/${c.slug}`,
    lastmod: c.created_at ? new Date(c.created_at).toISOString() : null,
  }));

  // inclui página /categorias
  urls.unshift({ loc: `${origin}/categorias`, lastmod: null });

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

