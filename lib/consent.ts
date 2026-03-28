"use client";

import { ZUNI_LS } from "@/lib/personalization/constants";
import type { PersonalizationConsentValue } from "@/lib/personalization/types";

const COOKIE_LEGACY = "zuni_cookies_consent";

function hasLegacyCookie(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie.split(";").some((c) => c.trim().startsWith(`${COOKIE_LEGACY}=`));
}

/**
 * Consentimento explícito para personalização (localStorage).
 * `null` = usuário ainda não escolheu no banner estendido.
 */
export function getConsentimentoPersonalizacao(): PersonalizationConsentValue | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(ZUNI_LS.personalizationConsent);
    if (v === "accepted" || v === "rejected") return v;
    const cookieFlag = window.localStorage.getItem(ZUNI_LS.cookieConsent);
    if (cookieFlag === "accepted") return "accepted";
    if (hasLegacyCookie() && cookieFlag !== "rejected") return "accepted";
    return null;
  } catch {
    return null;
  }
}

export function setPersonalizationConsent(value: PersonalizationConsentValue) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ZUNI_LS.personalizationConsent, value);
    window.localStorage.setItem(
      ZUNI_LS.cookieConsent,
      value === "accepted" ? "accepted" : "rejected",
    );
    window.dispatchEvent(new Event("zuni-personalization-consent"));
  } catch {
    /* ignore */
  }
}

export function personalizationAllowed(): boolean {
  return getConsentimentoPersonalizacao() === "accepted";
}
