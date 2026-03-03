"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const COOKIE_NAME = "zuni_cookies_consent";
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60; // 1 ano

function getConsent(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie.split(";").some((c) => c.trim().startsWith(`${COOKIE_NAME}=`));
}

function setConsent() {
  document.cookie = `${COOKIE_NAME}=1; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
}

export function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(!getConsent());
  }, []);

  function accept() {
    setConsent();
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Aviso de cookies"
      className="fixed bottom-0 left-0 right-0 z-[100] text-white shadow-lg border-t border-white/10"
      style={{ backgroundColor: "var(--zuni-purple-dark, #4C1D95)" }}
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-sm text-zinc-200">
          Utilizamos cookies para melhorar sua experiência e o funcionamento do site. Ao continuar,
          você concorda com nosso uso de cookies.{" "}
          <Link
            href="/aviso-de-cookies"
            className="underline hover:text-zuni-yellow font-medium"
          >
            Saber mais
          </Link>
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            href="/aviso-de-cookies"
            className="rounded-full border border-white/30 px-4 py-2 text-sm font-medium hover:bg-white/10 transition"
          >
            Saber mais
          </Link>
          <button
            type="button"
            onClick={accept}
            className="rounded-full bg-zuni-orange text-zuni-black px-4 py-2 text-sm font-semibold hover:opacity-95 transition"
          >
            Aceitar
          </button>
        </div>
      </div>
    </div>
  );
}
