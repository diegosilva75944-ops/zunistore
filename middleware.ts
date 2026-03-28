import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";
import {
  UUID_RE,
  visitSessionCookieOpts,
  ZUNI_VISIT_SESSION_COOKIE,
} from "@/lib/personalization/visit-session";

const cookieName = process.env.ADMIN_JWT_COOKIE_NAME || "zuni_admin";
const secret = new TextEncoder().encode(process.env.ADMIN_JWT_SECRET || "");

async function isValid(token: string) {
  if (!secret.length) return false;
  try {
    await jwtVerify(token, secret, { algorithms: ["HS256"] });
    return true;
  } catch {
    return false;
  }
}

const importMlCors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
} as const;

function ensureVisitorSessionCookie(req: NextRequest, res: NextResponse) {
  const v = req.cookies.get(ZUNI_VISIT_SESSION_COOKIE)?.value;
  if (v && UUID_RE.test(v)) return;
  res.cookies.set(
    ZUNI_VISIT_SESSION_COOKIE,
    crypto.randomUUID(),
    visitSessionCookieOpts(process.env.NODE_ENV === "production"),
  );
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isAdminPage = pathname.startsWith("/admin");
  const isAdminApi = pathname.startsWith("/api/admin");

  const isLoginPage = pathname === "/admin/login";
  const isLoginApi = pathname === "/api/admin/login" || pathname === "/api/admin/logout";
  const isImportApi = pathname === "/api/admin/import/mercadolivre";

  /** Extensão Chrome (origin chrome-extension://) precisa de CORS explícito no preflight e na resposta. */
  if (isImportApi) {
    if (req.method === "OPTIONS") {
      return new NextResponse(null, { status: 204, headers: { ...importMlCors } });
    }
    const res = NextResponse.next();
    Object.entries(importMlCors).forEach(([k, v]) => res.headers.set(k, v));
    ensureVisitorSessionCookie(req, res);
    return res;
  }

  if (isAdminPage && !isLoginPage) {
    const token = req.cookies.get(cookieName)?.value;
    if (!token || !(await isValid(token))) {
      const url = req.nextUrl.clone();
      url.pathname = "/admin/login";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
  }

  if (isAdminApi && !isLoginApi && !isImportApi) {
    const token = req.cookies.get(cookieName)?.value;
    if (!token || !(await isValid(token))) {
      return NextResponse.json({ ok: false, error: "Não autorizado." }, { status: 401 });
    }
  }

  const res = NextResponse.next();
  ensureVisitorSessionCookie(req, res);
  return res;
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/api/admin/:path*",
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
