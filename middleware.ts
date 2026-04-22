import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";
import {
  UUID_RE,
  visitSessionCookieOpts,
  ZUNI_VISIT_SESSION_COOKIE,
} from "@/lib/personalization/visit-session";
import { fetchProductPageStatusRpc } from "@/lib/postgrest/call-product-page-status";
import { resolvePdpMiddlewareFromRpc } from "@/lib/product-seo";

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

const PDP_PATH = /^\/produto\/([^/]+)\/([^/]+)\/?$/;

function gone410Html() {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta name="robots" content="noindex,follow"/><title>Produto removido</title></head><body style="font-family:system-ui,sans-serif;margin:2rem;max-width:36rem;line-height:1.5;color:#18181b"><h1 style="font-size:1.25rem">Este produto não está mais disponível</h1><p>Foi removido do catálogo. Você pode voltar ao <a href="/">início</a> ou usar a busca do site.</p><p style="color:#71717a;font-size:.875rem">HTTP 410 Gone</p></body></html>`;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  /** PDP: status HTTP real (410 Gone, 301 canónico/substituto) antes do RSC. */
  if (req.method === "GET" || req.method === "HEAD") {
    const m = pathname.match(PDP_PATH);
    if (m) {
      const code6 = decodeURIComponent(m[1]);
      const slug = decodeURIComponent(m[2]);
      const rpc = await fetchProductPageStatusRpc(code6, slug);
      const decision = resolvePdpMiddlewareFromRpc(rpc, code6);
      if (decision.action === "gone") {
        const res = new NextResponse(gone410Html(), {
          status: 410,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
        ensureVisitorSessionCookie(req, res);
        return res;
      }
      if (decision.action === "redirect") {
        const url = req.nextUrl.clone();
        url.pathname = decision.location.split("?")[0];
        url.search = "";
        const res = NextResponse.redirect(url, 301);
        ensureVisitorSessionCookie(req, res);
        return res;
      }
    }
  }

  /** Evita página que só faz redirect (causava TypeError em Performance.measure no React/Next 16). */
  if (pathname === "/admin" || pathname === "/admin/") {
    const url = req.nextUrl.clone();
    url.pathname = "/admin/produtos";
    return NextResponse.redirect(url);
  }

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
    "/admin",
    "/admin/:path*",
    "/api/admin/:path*",
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
