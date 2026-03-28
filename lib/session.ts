"use client";

import { ZUNI_LS } from "@/lib/personalization/constants";
import {
  formatVisitSessionDocumentCookie,
  UUID_RE,
  ZUNI_VISIT_SESSION_COOKIE,
} from "@/lib/personalization/visit-session";

function randomUuid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function readVisitCookie(): string {
  if (typeof document === "undefined") return "";
  const prefix = `${ZUNI_VISIT_SESSION_COOKIE}=`;
  const parts = document.cookie.split("; ");
  for (const p of parts) {
    if (p.startsWith(prefix)) {
      return decodeURIComponent(p.slice(prefix.length));
    }
  }
  return "";
}

/**
 * ID de visita: cookie `zuni_visit_sid` (alinha com o servidor).
 * Migra valor antigo do localStorage se necessário.
 */
export function getSessionId(): string {
  if (typeof window === "undefined") return "";
  try {
    let c = readVisitCookie();
    if (c && UUID_RE.test(c)) return c;

    const legacy = window.localStorage.getItem(ZUNI_LS.sessionId);
    if (legacy && UUID_RE.test(legacy)) {
      const secure = window.location.protocol === "https:";
      document.cookie = formatVisitSessionDocumentCookie(legacy, secure);
      return legacy;
    }

    const id = randomUuid();
    const secure = window.location.protocol === "https:";
    document.cookie = formatVisitSessionDocumentCookie(id, secure);
    window.localStorage.setItem(ZUNI_LS.sessionId, id);
    return id;
  } catch {
    return "";
  }
}

/** Evita vários fetches em paralelo sem cookie (cada um geraria UUID diferente no servidor). */
export function hasVisitSessionCookie(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie.split("; ").some((row) => row.startsWith(`${ZUNI_VISIT_SESSION_COOKIE}=`));
}
