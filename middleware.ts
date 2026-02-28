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

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isAdminPage = pathname.startsWith("/admin");
  const isAdminApi = pathname.startsWith("/api/admin");

  const isLoginPage = pathname === "/admin/login";
  const isLoginApi = pathname === "/api/admin/login" || pathname === "/api/admin/logout";
  const isImportApi = pathname === "/api/admin/import/mercadolivre";

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

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};

