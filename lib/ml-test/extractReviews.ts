import type { CheerioAPI } from "cheerio";

export function parseReviewsNumberBr(str: string): number | null {
  const raw = String(str || "")
    .replace(/\./g, "")
    .replace(/,/g, "");
  const num = parseInt(raw, 10);
  return Number.isFinite(num) && num > 0 && num < 10000000 ? num : null;
}

/** Nota 0–5 no formato BR (ex.: "4,5"). */
export function parseRatingBr(str: string): number | null {
  const t = String(str || "").trim().replace(/\s/g, "");
  const m = t.match(/(\d+)[,.](\d+)/);
  if (m) {
    const n = parseFloat(`${m[1]}.${m[2]}`);
    if (Number.isFinite(n) && n >= 0 && n <= 5) return n;
  }
  const m2 = t.match(/^(\d+)$/);
  if (m2) {
    const n = parseInt(m2[1], 10);
    if (n >= 0 && n <= 5) return n;
  }
  const plain = parseFloat(t.replace(",", "."));
  if (Number.isFinite(plain) && plain >= 0 && plain <= 5) return plain;
  return null;
}

export function preferMaxNullable(
  a: number | null | undefined,
  b: number | null | undefined,
): number | null {
  const x = a != null && Number.isFinite(a) ? a : null;
  const y = b != null && Number.isFinite(b) ? b : null;
  if (x != null && y != null) return Math.max(x, y);
  return x ?? y ?? null;
}

export function extractReviewsCountFromDom($: CheerioAPI, html: string): number | null {
  let best = 0;

  const bump = (n: number | null) => {
    if (n != null && n > best) best = n;
  };

  const tryLabel = (text: string) => {
    const m = text.match(/([\d.,]+)\s*avaliações?/i);
    if (m) bump(parseReviewsNumberBr(m[1]));
  };

  $("#reviews_capability_v3 p.ui-review-capability__rating__label").each((_, el) => {
    tryLabel($(el).text());
  });

  if (!best) {
    $("#reviews_capability_v3")
      .find("p, span, div")
      .each((_, el) => {
        const text = $(el).text().trim();
        if (!/avalia/i.test(text)) return;
        const m = text.match(/([\d.,]+)\s*avaliações?/i) || text.match(/([\d.,]+)/);
        if (m) bump(parseReviewsNumberBr(m[1]));
      });
  }

  $(".ui-review-capability__rating__label, p.ui-review-capability__rating__label").each((_, el) => {
    tryLabel($(el).text());
  });

  const bodyText = $.root().text().replace(/\s+/g, " ");
  const re = /([\d.,]+)\s*avaliações?/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(bodyText)) !== null) {
    bump(parseReviewsNumberBr(match[1]));
  }

  const jsonMatches =
    html.match(/"reviewCount"\s*:\s*(\d+)/gi) ||
    html.match(/"total_reviews"\s*:\s*(\d+)/gi) ||
    html.match(/"reviews_count"\s*:\s*(\d+)/gi);
  if (jsonMatches) {
    for (const jm of jsonMatches) {
      const numMatch = jm.match(/(\d+)/);
      if (numMatch) {
        const n = parseInt(numMatch[1], 10);
        if (n > best && n < 10000000) best = n;
      }
    }
  }

  $(".ui-pdp-header__info .ui-pdp-review__amount").each((_, el) => {
    const text = $(el).text().trim();
    const inParens = text.match(/\(([\d.,]+)\)/);
    const plain = text.match(/[\d.,]+/);
    const raw = inParens ? inParens[1] : plain ? plain[0] : null;
    if (raw) bump(parseReviewsNumberBr(raw));
  });

  return best > 0 ? best : null;
}

export function extractRatingFromDom($: CheerioAPI): number | null {
  const itemprop = $('[itemprop="ratingValue"]').first();
  const attr = itemprop.attr("content") || itemprop.text();
  if (attr) {
    const n = parseFloat(String(attr).replace(",", "."));
    if (Number.isFinite(n) && n >= 0 && n <= 5) return n;
  }
  const reviewRating = $(".ui-pdp-review__rating").first().text();
  if (reviewRating) {
    const n = parseRatingBr(reviewRating);
    if (n != null) return n;
  }
  const cap = $(
    "#reviews_capability_v3 .ui-review-capability__rating__score, .ui-review-capability__rating__score",
  ).first();
  const capText = cap.text();
  if (capText) {
    const n = parseRatingBr(capText);
    if (n != null) return n;
  }
  return null;
}

export function extractRatingAndReviews($: CheerioAPI, html: string): {
  rating: number | null;
  reviewsCount: number | null;
} {
  return {
    rating: extractRatingFromDom($),
    reviewsCount: extractReviewsCountFromDom($, html),
  };
}
