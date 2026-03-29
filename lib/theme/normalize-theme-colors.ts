import type { CSSProperties } from "react";

/**
 * Normaliza `site_settings.colors` (jsonb) para uso em `style` do `<html>` ou `:root`.
 */
export function normalizeThemeColors(raw: unknown): Record<string, string> | null {
  if (raw == null) return null;
  if (typeof raw === "string") {
    try {
      return normalizeThemeColors(JSON.parse(raw) as unknown);
    } catch {
      return null;
    }
  }
  if (typeof raw !== "object" || Array.isArray(raw)) return null;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "string" && v.trim()) {
      out[k] = v.trim();
    } else if (typeof v === "number" && Number.isFinite(v)) {
      out[k] = String(v);
    }
  }
  return Object.keys(out).length ? out : null;
}

/** Só variáveis CSS (--) para injetar no tema ao vivo. */
export function themeColorsToHtmlStyle(colors: Record<string, string> | null): CSSProperties | undefined {
  if (!colors) return undefined;
  const style: Record<string, string> = {};
  for (const [k, v] of Object.entries(colors)) {
    if (!k.startsWith("--") || !v.trim()) continue;
    style[k] = v.trim();
  }
  return Object.keys(style).length ? (style as CSSProperties) : undefined;
}
