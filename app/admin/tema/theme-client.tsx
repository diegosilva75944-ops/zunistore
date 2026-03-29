"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ThemeColorField } from "@/components/admin/ThemeColorField";
import { HOME_OFFERS_THEME_FIELDS, HOME_OFFERS_THEME_KEYS } from "@/lib/theme/home-offers-theme";

const fetchAdmin: RequestInit = { credentials: "include", cache: "no-store" };

/** Exibidos em bloco próprio (fundo do site), não na grade geral de variáveis */
const PAGE_SURFACE_KEYS = ["--zuni-page-bg", "--zuni-nested-surface"] as const;

const DEFAULT_KEYS = [
  "--zuni-page-bg",
  "--zuni-nested-surface",
  "--zuni-primary",
  "--zuni-purple-dark",
  "--zuni-purple-light",
  "--zuni-green",
  "--zuni-yellow",
  "--zuni-red",
  "--zuni-orange",
  "--zuni-black",
  "--zuni-white",
  "--background",
  "--foreground",
  "--header-bg",
  "--card-bg",
  "--muted",
];

type OffersSectionPosition = "after_hero" | "before_hero";

export function ThemeClient() {
  const [logoUrl, setLogoUrl] = useState<string>("");
  const [colors, setColors] = useState<Record<string, string>>({});
  const [offersSectionPosition, setOffersSectionPosition] = useState<OffersSectionPosition>("after_hero");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const keys = useMemo(() => {
    const offersSet = new Set(HOME_OFFERS_THEME_KEYS);
    const pageSurfaceSet = new Set<string>(PAGE_SURFACE_KEYS);
    const set = new Set([
      ...DEFAULT_KEYS,
      ...Object.keys(colors).filter((k) => !offersSet.has(k) && !pageSurfaceSet.has(k)),
    ]);
    return Array.from(set).filter((k) => !pageSurfaceSet.has(k));
  }, [colors]);

  const loadSettings = useCallback(() => {
    fetch("/api/admin/site-settings", fetchAdmin)
      .then((r) => r.json())
      .then((data) => {
        const s = data?.settings;
        setLogoUrl(s?.logo_url ?? "");
        setColors(typeof s?.colors === "object" && s?.colors ? { ...s.colors } : {});
        setOffersSectionPosition(
          s?.offers_section_position === "before_hero" ? "before_hero" : "after_hero",
        );
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  async function save() {
    setBusy(true);
    setMsg(null);

    const filtered: Record<string, string> = {};
    for (const [k, v] of Object.entries(colors)) {
      const key = String(k).trim();
      const val = String(v).trim();
      if (!key.startsWith("--") || !val) continue;
      filtered[key] = val;
    }

    const res = await fetch("/api/admin/site-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      ...fetchAdmin,
      body: JSON.stringify({
        logo_url: logoUrl ? logoUrl.trim() : null,
        colors: filtered,
        offers_section_position: offersSectionPosition,
      }),
    }).catch(() => null);

    setBusy(false);
    if (!res || !res.ok) {
      const data = res ? await res.json().catch(() => null) : null;
      setMsg(data?.error || "Falha ao salvar.");
      return;
    }
    setMsg("Tema salvo. Atualize a página inicial (F5) se já estiver aberta em outra aba.");
    loadSettings();
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-zinc-50 ring-1 ring-zinc-200 p-4 space-y-3">
        <div className="text-sm font-semibold">Seção «Produtos em oferta» (página inicial)</div>
        <p className="text-xs text-zinc-600">
          Escolha se os cards de ofertas aparecem antes ou depois do carrossel principal.
        </p>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="offers_pos"
              checked={offersSectionPosition === "after_hero"}
              onChange={() => setOffersSectionPosition("after_hero")}
            />
            Depois do carrossel
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="offers_pos"
              checked={offersSectionPosition === "before_hero"}
              onChange={() => setOffersSectionPosition("before_hero")}
            />
            Antes do carrossel
          </label>
        </div>
      </div>

      {/* Cores da secção «Produtos em oferta»: gravadas em site_settings.colors como --home-offers-* (ver globals.css) */}
      <div className="rounded-2xl bg-zinc-50 ring-1 ring-zinc-200 p-4 space-y-3">
        <div className="text-sm font-semibold">Aparência — Produtos em oferta (home)</div>
        <p className="text-xs text-zinc-600">
          Use o quadrado colorido para abrir a paleta do sistema. O campo ao lado aceita{" "}
          <span className="font-mono">#hex</span> ou <span className="font-mono">rgba(...)</span> (útil
          para transparência). Vazio = padrão do CSS. Depois de salvar, recarregue a página inicial para ver
          o resultado.
        </p>
        <div className="grid gap-3 md:grid-cols-1">
          {HOME_OFFERS_THEME_FIELDS.map(({ key, label, hint }) => (
            <div key={key} className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-3">
              <div className="min-w-0 sm:w-[min(42%,280px)] sm:pt-2">
                <div className="text-xs font-medium text-zinc-800">{label}</div>
                <div className="text-[10px] font-mono text-zinc-500 break-all">{key}</div>
              </div>
              <ThemeColorField
                value={colors[key] ?? ""}
                onChange={(v) => setColors((s) => ({ ...s, [key]: v }))}
                placeholder={hint ?? ""}
                ariaLabel={label}
              />
            </div>
          ))}
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          className="rounded-full bg-zuni-primary px-6 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {busy ? "Salvando…" : "Salvar tema (inclui ofertas)"}
        </button>
      </div>

      <div className="rounded-2xl bg-zinc-50 ring-1 ring-zinc-200 p-4 space-y-2">
        <div className="text-sm font-semibold">Logo (URL PNG)</div>
        <input
          value={logoUrl}
          onChange={(e) => setLogoUrl(e.target.value)}
          placeholder="https://.../logo.png"
          className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-mono"
        />
        <div className="text-xs text-zinc-600">
          Dica: você pode hospedar em Supabase Storage ou em qualquer CDN/URL pública.
        </div>
      </div>

      <div className="rounded-2xl bg-zinc-50 ring-1 ring-zinc-200 p-4 space-y-3">
        <div className="text-sm font-semibold">Fundo da página</div>
        <p className="text-xs text-zinc-600">
          Cor do fundo atrás de todo o conteúdo público do site. Painéis internos (filtros, área da imagem nos
          cards) usam a segunda variável. Vazio = padrão do arquivo de estilos (
          <span className="font-mono">#ffffff</span> e <span className="font-mono">#f5f5f5</span>).
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <div className="text-xs font-medium text-zinc-800">Fundo do site</div>
            <div className="text-[10px] font-mono text-zinc-500 break-all">--zuni-page-bg</div>
            <ThemeColorField
              value={colors["--zuni-page-bg"] ?? ""}
              onChange={(v) => setColors((s) => ({ ...s, "--zuni-page-bg": v }))}
              placeholder="#ffffff"
              ariaLabel="Fundo da página do site"
            />
          </div>
          <div className="space-y-1">
            <div className="text-xs font-medium text-zinc-800">Painéis internos</div>
            <div className="text-[10px] font-mono text-zinc-500 break-all">--zuni-nested-surface</div>
            <ThemeColorField
              value={colors["--zuni-nested-surface"] ?? ""}
              onChange={(v) => setColors((s) => ({ ...s, "--zuni-nested-surface": v }))}
              placeholder="#f5f5f5"
              ariaLabel="Cor de painéis internos"
            />
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-zinc-50 ring-1 ring-zinc-200 p-4 space-y-3">
        <div className="text-sm font-semibold">Cores (CSS variables)</div>

        <p className="text-xs text-zinc-600">
          Clique no seletor para abrir a paleta; valores em <span className="font-mono">rgba</span> podem
          ser digitados quando precisar de transparência.
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          {keys.map((k) => (
            <div key={k} className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-2">
              <div className="w-full shrink-0 pt-2 text-xs font-mono text-zinc-700 sm:w-44">{k}</div>
              <ThemeColorField
                value={colors[k] ?? ""}
                onChange={(v) => setColors((s) => ({ ...s, [k]: v }))}
                placeholder="#RRGGBB"
                ariaLabel={k}
              />
            </div>
          ))}
        </div>

        {msg ? (
          <div className="text-sm text-zinc-700 bg-white border border-zinc-200 rounded-xl px-3 py-2">
            {msg}
          </div>
        ) : null}

        <button
          disabled={busy}
          onClick={save}
          className="rounded-full bg-zuni-primary px-6 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {busy ? "Salvando…" : "Salvar"}
        </button>
      </div>
    </div>
  );
}

