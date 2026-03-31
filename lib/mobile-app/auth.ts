import "server-only";

/**
 * Autenticação do app worker (celular).
 * Configure MOBILE_APP_API_KEY no servidor e o mesmo valor no app.
 */
export function getMobileAppApiKey(): string | null {
  const k = process.env.MOBILE_APP_API_KEY?.trim();
  return k && k.length >= 16 ? k : null;
}

export function assertMobileAppAuthorized(req: Request): void {
  const expected = getMobileAppApiKey();
  if (!expected) {
    throw new MobileAppAuthError("MOBILE_APP_API_KEY não configurada no servidor.", 503);
  }
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  const token = m?.[1]?.trim() || req.headers.get("x-mobile-api-key")?.trim();
  if (!token || token !== expected) {
    throw new MobileAppAuthError("Não autorizado.", 401);
  }
}

export class MobileAppAuthError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "MobileAppAuthError";
    this.status = status;
  }
}
