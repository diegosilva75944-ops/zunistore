import { headers } from "next/headers";
import { getOptionalEnv } from "@/lib/env";

/** Primeiro valor de header que pode vir como lista (ex.: proxy chains). */
function headerFirst(name: string, h: Headers): string {
  const raw = h.get(name);
  if (!raw) return "";
  const first = raw.split(",")[0]?.trim();
  return first ?? "";
}

/** Host que não pode ir para Location / OG (Docker costuma expor 0.0.0.0:3000). */
function isInvalidPublicHost(hostHeader: string): boolean {
  const hostOnly = hostHeader.split(":")[0]?.replace(/^\[|\]$/g, "") ?? "";
  const h = hostOnly.toLowerCase();
  return h === "0.0.0.0" || h === "" || h === "::";
}

function rawPublicSiteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  return raw && raw.startsWith("http") ? raw : "";
}

/**
 * Origem pública a partir do Request (útil em Route Handlers onde req.url pode ser http://0.0.0.0:3000/...).
 */
export function getPublicOriginFromRequest(req: Request): string | null {
  const fromEnv = rawPublicSiteUrl();
  if (fromEnv) return fromEnv;

  const forwarded = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwarded || req.headers.get("host") || "";
  if (!host || isInvalidPublicHost(host)) return null;

  let proto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (proto !== "http" && proto !== "https") {
    proto = req.headers.get("x-forwarded-ssl") === "on" ? "https" : "http";
  }
  return `${proto}://${host}`;
}

/**
 * URL base do site (protocolo + host, sem barra final).
 * 1) NEXT_PUBLIC_SITE_URL (recomendado em produção / Docker)
 * 2) x-forwarded-host + x-forwarded-proto (proxy reverso: Coolify, Traefik, etc.)
 *    — evita usar Host interno tipo 10.x no compartilhamento
 * 3) host
 */
export async function getBaseUrl(): Promise<string> {
  const env = getOptionalEnv();
  const fromEnv = env?.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  if (fromEnv) return fromEnv;

  const fallbackEnv = rawPublicSiteUrl();
  if (fallbackEnv) return fallbackEnv;

  try {
    const h = await headers();
    const forwardedHost = headerFirst("x-forwarded-host", h);
    const host = forwardedHost || headerFirst("host", h);
    if (!host || isInvalidPublicHost(host)) {
      return rawPublicSiteUrl();
    }

    const forwardedProto = headerFirst("x-forwarded-proto", h);
    let proto: string;
    if (forwardedProto === "https" || forwardedProto === "http") {
      proto = forwardedProto;
    } else if (h.get("x-forwarded-ssl") === "on") {
      proto = "https";
    } else {
      proto = "http";
    }

    const base = `${proto}://${host}`;
    try {
      const u = new URL(base);
      if (isInvalidPublicHost(u.hostname)) return rawPublicSiteUrl();
    } catch {
      return rawPublicSiteUrl();
    }
    return base;
  } catch {
    return rawPublicSiteUrl();
  }
}
