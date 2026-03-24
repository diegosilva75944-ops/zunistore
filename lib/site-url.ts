import { headers } from "next/headers";
import { getOptionalEnv } from "@/lib/env";

/** Primeiro valor de header que pode vir como lista (ex.: proxy chains). */
function headerFirst(name: string, h: Headers): string {
  const raw = h.get(name);
  if (!raw) return "";
  const first = raw.split(",")[0]?.trim();
  return first ?? "";
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

  try {
    const h = await headers();
    const forwardedHost = headerFirst("x-forwarded-host", h);
    const host = forwardedHost || headerFirst("host", h);
    if (!host) return "";

    const forwardedProto = headerFirst("x-forwarded-proto", h);
    let proto: string;
    if (forwardedProto === "https" || forwardedProto === "http") {
      proto = forwardedProto;
    } else if (h.get("x-forwarded-ssl") === "on") {
      proto = "https";
    } else {
      proto = "http";
    }

    return `${proto}://${host}`;
  } catch {
    return "";
  }
}
