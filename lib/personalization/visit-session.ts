/** Cookie de visita: mesma identidade no cliente e nas APIs (evita perfil “trocado”). */
export const ZUNI_VISIT_SESSION_COOKIE = "zuni_visit_sid";

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function visitSessionCookieOpts(secure: boolean) {
  return {
    path: "/" as const,
    maxAge: 60 * 60 * 24 * 400,
    sameSite: "lax" as const,
    secure,
    httpOnly: false,
  };
}

/** Sincroniza com `document.cookie` quando o middleware ainda não rodou. */
export function formatVisitSessionDocumentCookie(id: string, secure: boolean): string {
  const s = secure ? "; Secure" : "";
  return `${ZUNI_VISIT_SESSION_COOKIE}=${encodeURIComponent(id)}; Path=/; Max-Age=34560000; SameSite=Lax${s}`;
}
