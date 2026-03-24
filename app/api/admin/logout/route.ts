import { NextResponse } from "next/server";
import { clearAdminSessionCookie } from "@/lib/admin/auth";
import { getBaseUrl, getPublicOriginFromRequest } from "@/lib/site-url";

export const runtime = "nodejs";

function refererOrigin(req: Request): string | null {
  const ref = req.headers.get("referer");
  if (!ref) return null;
  try {
    return new URL(ref).origin;
  } catch {
    return null;
  }
}

function isUnsafeRedirectBase(urlStr: string): boolean {
  try {
    const u = new URL(urlStr);
    const h = u.hostname.toLowerCase();
    return h === "0.0.0.0" || h === "[::]" || h === "::";
  } catch {
    return true;
  }
}

export async function POST(req: Request) {
  await clearAdminSessionCookie();

  let base = await getBaseUrl();
  if (!base || isUnsafeRedirectBase(base)) {
    base = refererOrigin(req) ?? "";
  }
  if (!base || isUnsafeRedirectBase(base)) {
    const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
    if (raw && raw.startsWith("http")) base = raw;
  }

  if (base && !isUnsafeRedirectBase(base)) {
    return NextResponse.redirect(`${base.replace(/\/$/, "")}/`, 302);
  }

  const fromReq = getPublicOriginFromRequest(req);
  if (fromReq && !isUnsafeRedirectBase(fromReq)) {
    return NextResponse.redirect(`${fromReq.replace(/\/$/, "")}/`, 302);
  }

  const ref = refererOrigin(req);
  if (ref && !isUnsafeRedirectBase(ref)) {
    return NextResponse.redirect(`${ref}/`, 302);
  }

  // Location relativo: o navegador resolve com o host da requisição (domínio público), não com req.url interno.
  return new NextResponse(null, { status: 302, headers: { Location: "/" } });
}
