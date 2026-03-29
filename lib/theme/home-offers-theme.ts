/**
 * Variáveis CSS da secção «Produtos em Oferta» (home).
 * Editáveis em Admin → Tema; injetadas em :root via `site_settings.colors` (layout).
 */
export const HOME_OFFERS_THEME_FIELDS: {
  key: string;
  label: string;
  hint?: string;
}[] = [
  { key: "--home-offers-bg-start", label: "Fundo — topo do gradiente", hint: "ex: #fdfcff" },
  { key: "--home-offers-bg-mid", label: "Fundo — meio do gradiente", hint: "ex: #fafbfc" },
  { key: "--home-offers-bg-end", label: "Fundo — base do gradiente", hint: "ex: #fffdfb" },
  { key: "--home-offers-border", label: "Cor da borda da secção", hint: "ex: rgba(226,232,240,0.95)" },
  {
    key: "--home-offers-shadow-tint",
    label: "Sombra externa suave (cor)",
    hint: "ex: rgba(109,40,217,0.08) · use transparent para desligar",
  },
  {
    key: "--home-offers-inset-highlight",
    label: "Brilho interno no topo (inset)",
    hint: "ex: rgba(255,255,255,1) · linha clara no bordo superior",
  },
  {
    key: "--home-offers-marquee-bg-start",
    label: "Painel do carrossel — topo",
    hint: "ex: rgba(255,255,255,0.92)",
  },
  {
    key: "--home-offers-marquee-bg-end",
    label: "Painel do carrossel — base",
    hint: "ex: rgba(255,255,255,0.72)",
  },
  {
    key: "--home-offers-marquee-border",
    label: "Borda do painel do carrossel",
    hint: "ex: rgba(241,245,249,0.9)",
  },
  { key: "--home-offers-badge-text", label: "Selo «Oferta» — texto", hint: "ex: #7c6bb0" },
  {
    key: "--home-offers-badge-bg-start",
    label: "Selo — fundo (início)",
    hint: "ex: rgba(255,251,235,0.95)",
  },
  {
    key: "--home-offers-badge-bg-end",
    label: "Selo — fundo (fim)",
    hint: "ex: rgba(254,249,231,0.92)",
  },
  {
    key: "--home-offers-badge-border",
    label: "Selo — borda",
    hint: "ex: rgba(253,224,171,0.45)",
  },
];

export const HOME_OFFERS_THEME_KEYS = HOME_OFFERS_THEME_FIELDS.map((f) => f.key);
