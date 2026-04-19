import { load } from "cheerio";

/**
 * Sanitiza HTML de descrição de produto (import ML ou legado) para renderização com
 * `dangerouslySetInnerHTML`. Permite texto estruturado e imagens HTTPS; remove scripts e atributos perigosos.
 */
export function sanitizeProductDescriptionHtml(raw: string): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";

  const $ = load(s);
  const root = $.root();

  root.find("script,style,noscript,iframe,object,embed,form,input,button").remove();
  root.find("*").each((_, el) => {
    const node = $(el);
    const elem = node[0] as { attribs?: Record<string, string> } | undefined;
    const attribs = elem?.attribs;
    if (!attribs) return;
    for (const attr of Object.keys(attribs)) {
      if (/^on/i.test(attr)) node.removeAttr(attr);
      if (attr === "style" && /url\s*\(|expression|javascript:/i.test(attribs[attr] ?? "")) {
        node.removeAttr("style");
      }
    }
  });

  root.find("img").each((_, img) => {
    const $img = $(img);
    let src = ($img.attr("src") || $img.attr("data-src") || "").trim();
    if (src.startsWith("//")) src = `https:${src}`;
    if (!/^https:\/\//i.test(src)) {
      $img.remove();
      return;
    }
    $img.attr("src", src);
    $img.removeAttr("data-src");
    $img.removeAttr("srcset");
    $img.removeAttr("sizes");
    $img.removeAttr("crossorigin");
    $img.attr("loading", "lazy");
    $img.attr("decoding", "async");
    if (!$img.attr("alt")) $img.attr("alt", "");
    $img.addClass("max-w-full h-auto rounded-lg my-3");
  });

  root.find("a").each((_, a) => {
    const $a = $(a);
    const href = ($a.attr("href") || "").trim();
    if (!/^https:\/\//i.test(href)) {
      $a.replaceWith($a.contents());
    } else {
      $a.attr("href", href);
      $a.attr("rel", "nofollow noopener noreferrer");
      $a.attr("target", "_blank");
    }
  });

  return root.html()?.trim() ?? "";
}

/** Texto plano para JSON-LD / meta quando `description_detail` guarda HTML. */
export function stripHtmlToPlainText(raw: string): string {
  return String(raw ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Heurística: conteúdo provavelmente HTML seguro para renderizar (vs. texto plano legado). */
export function productDescriptionLooksLikeHtml(s: string): boolean {
  const t = String(s ?? "").trim();
  if (!t) return false;
  return /<\s*(p|div|br|img|ul|ol|li|strong|b|em|i|h[1-6]|span|figure)\b/i.test(t);
}
