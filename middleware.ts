import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

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

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isAdminPage = pathname.startsWith("/admin");
  const isAdminApi = pathname.startsWith("/api/admin");

  const isLoginPage = pathname === "/admin/login";
  const isLoginApi = pathname === "/api/admin/login" || pathname === "/api/admin/logout";
  /** Import ML + sync de preços via extensão (Bearer token); sem cookie de admin. */
  const isImportMlApi = pathname.startsWith("/api/admin/import/mercadolivre");

  /** Extensão Chrome (origin chrome-extension://) precisa de CORS explícito no preflight e na resposta. */
  if (isImportMlApi) {
    if (req.method === "OPTIONS") {
      return new NextResponse(null, { status: 204, headers: { ...importMlCors } });
    }
    const res = NextResponse.next();
    Object.entries(importMlCors).forEach(([k, v]) => res.headers.set(k, v));
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

  if (isAdminApi && !isLoginApi && !isImportMlApi) {
    const token = req.cookies.get(cookieName)?.value;
    if (!token || !(await isValid(token))) {
      return NextResponse.json({ ok: false, error: "Não autorizado." }, { status: 401 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};

