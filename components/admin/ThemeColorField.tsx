"use client";

import { useMemo } from "react";

function expandShortHex(hex: string): string {
  const h = hex.slice(1);
  if (h.length !== 3) return hex;
  return "#" + [...h].map((c) => c + c).join("");
}

/** Converte valor CSS (#hex, rgb, rgba) para #rrggbb usado pelo input color. */
export function parseToHexForPicker(raw: string): string {
  const v = raw.trim();
  if (!v) return "#ffffff";
  if (/^#[0-9a-f]{6}$/i.test(v)) return v.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(v)) return expandShortHex(v).toLowerCase();
  const m = v.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
  if (m) {
    const r = Math.min(255, Math.max(0, Math.round(Number(m[1]))));
    const g = Math.min(255, Math.max(0, Math.round(Number(m[2]))));
    const b = Math.min(255, Math.max(0, Math.round(Number(m[3]))));
    if ([r, g, b].every((n) => Number.isFinite(n))) {
      return "#" + [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("");
    }
  }
  return "#ffffff";
}

type Props = {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  ariaLabel: string;
};

/**
 * Campo de cor para o tema: paleta nativa do navegador + texto para #hex ou rgba.
 */
export function ThemeColorField({ value, onChange, placeholder, ariaLabel }: Props) {
  const pickerValue = useMemo(() => parseToHexForPicker(value), [value]);

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <input
        type="color"
        value={pickerValue}
        title="Abrir paleta de cores"
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-14 shrink-0 cursor-pointer rounded-lg border border-zinc-200 bg-white p-0.5 shadow-sm hover:border-zuni-primary/40 focus:outline-none focus:ring-2 focus:ring-zuni-primary/30"
        aria-label={`Paleta: ${ariaLabel}`}
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-0 flex-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-mono"
        placeholder={placeholder}
        spellCheck={false}
        aria-label={`${ariaLabel} (valor CSS)`}
      />
    </div>
  );
}
