import "server-only";

import { slugify } from "@/lib/slug";

const STOPWORDS = new Set([
  "a","o","os","as","um","uma","uns","umas","de","da","do","das","dos","para","por","com","sem",
  "em","no","na","nos","nas","e","ou","ao","aos","à","às","que","como","mais","menos","muito","muita",
  "muitos","muitas","novo","nova","novos","novas","kit","pack","tipo","modelo","original","oficial",
]);

export function tokenizePtBr(text: string) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3)
    .filter((t) => !STOPWORDS.has(t));
}

export function ngrams(tokens: string[], n: 2 | 3) {
  const out: string[] = [];
  for (let i = 0; i + n - 1 < tokens.length; i++) {
    out.push(tokens.slice(i, i + n).join(" "));
  }
  return out;
}

export function makeSeoQueryFromPhrase(phrase: string) {
  const slug = slugify(phrase);
  return {
    slug,
    title: `${capitalize(phrase)} — Ofertas e preços`,
    description: `Confira ${phrase} com ofertas, preços e destaque de avaliações no ZuniStore.`,
    query_terms: phrase.split(" "),
  };
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

