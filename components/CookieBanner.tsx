"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getConsentimentoPersonalizacao, setPersonalizationConsent } from "@/lib/consent";
import { limparHistoricoPersonalizacao } from "@/lib/tracking";

const LEGACY_COOKIE = "zuni_cookies_consent";
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60;

function hasLegacyCookie(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie.split(";").some((c) => c.trim().startsWith(`${LEGACY_COOKIE}=`));
}

/** Mantém compatibilidade com integrações que só leem o cookie antigo. */
function setLegacyCookie(value: "1" | "") {
  if (value === "1") {
    document.cookie = `${LEGACY_COOKIE}=1; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
  } else {
    document.cookie = `${LEGACY_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
  }
}

/**
 * Banner único: cookies + personalização (LGPD).
 * Recusa desliga tracking/recomendações e limpa histórico local + sessão no servidor.
 */
export function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const choice = getConsentimentoPersonalizacao();
    setVisible(choice === null && !hasLegacyCookie());
  }, []);

  function accept() {
    setPersonalizationConsent("accepted");
    setLegacyCookie("1");
    setVisible(false);
  }

  function reject() {
    setPersonalizationConsent("rejected");
    setLegacyCookie("");
    limparHistoricoPersonalizacao();
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookies e personalização"
      className="fixed bottom-0 left-0 right-0 z-[100] text-white shadow-lg border-t border-white/10"
      style={{ backgroundColor: "var(--zuni-purple-dark, #4C1D95)" }}
    >
      <div className="zuni-site-container py-4 flex flex-col gap-3">
        <p className="text-sm text-zinc-200 leading-relaxed">
          Usamos cookies, armazenamento local e dados de interação (buscas, cliques, páginas de produto e categorias
          visitadas) para exibir uma vitrine mais relevante. Produtos recomendados podem ser exibidos com base nessas
          interações dentro do site. Você pode aceitar a personalização ou recusar — o site continua funcionando; se
          recusar, mostramos apenas conteúdo geral (ex.: populares).{" "}
          <Link href="/politica-de-privacidade" className="underline hover:text-zuni-yellow font-medium">
            Saiba mais
          </Link>{" "}
          na Política de Privacidade.
        </p>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-2 shrink-0">
          <Link
            href="/politica-de-privacidade"
            className="rounded-full border border-white/30 px-4 py-2 text-sm font-medium text-center hover:bg-white/10 transition"
          >
            Política de Privacidade
          </Link>
          <button
            type="button"
            onClick={reject}
            className="rounded-full border border-white/30 px-4 py-2 text-sm font-medium hover:bg-white/10 transition"
          >
            Recusar personalização
          </button>
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
