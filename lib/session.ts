"use client";

import { ZUNI_LS } from "@/lib/personalization/constants";

function randomUuid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** ID estável por navegador (localStorage). Usado em APIs de tracking e recomendação. */
export function getSessionId(): string {
  if (typeof window === "undefined") return "";
  try {
    let id = window.localStorage.getItem(ZUNI_LS.sessionId);
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
      id = randomUuid();
      window.localStorage.setItem(ZUNI_LS.sessionId, id);
    }
    return id;
  } catch {
    return "";
  }
}
