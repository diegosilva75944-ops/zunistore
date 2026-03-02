import { headers } from "next/headers";
import { getOptionalEnv } from "@/lib/env";

/** Retorna a URL base do site (com protocolo, sem barra final). Usa NEXT_PUBLIC_SITE_URL ou deriva do request (host + x-forwarded-proto). */
export async function getBaseUrl(): Promise<string> {
  const env = getOptionalEnv();
  const fromEnv = env?.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  if (fromEnv) return fromEnv;

  try {
    const h = await headers();
    const host = h.get("host") || h.get("x-forwarded-host");
    if (!host) return "";
    const proto =
      h.get("x-forwarded-proto") === "https" || h.get("x-forwarded-ssl") === "on"
        ? "https"
        : "http";
    return `${proto}://${host}`;
  } catch {
    return "";
  }
}
