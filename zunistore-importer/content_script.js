(() => {
  function normalizeText(s) {
    return String(s || "").replace(/\s+/g, " ").trim();
  }

  function parseBRL(text) {
    const m = String(text || "").match(/R\$\s*([\d\.]+,\d{2})/);
    if (!m) return null;
    const raw = m[1].replace(/\./g, "").replace(",", ".");
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  function extractFromJsonLd() {
    const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
    for (const s of scripts) {
      const raw = s.textContent;
      if (!raw) continue;
      let json;
      try {
        json = JSON.parse(raw);
      } catch {
        continue;
      }
      const arr = Array.isArray(json) ? json : [json];
      for (const obj of arr) {
        const product = findProduct(obj);
        if (!product) continue;

        const title = product.name ? normalizeText(product.name) : null;
        const description = product.description ? normalizeText(product.description) : null;

        let images = [];
        if (typeof product.image === "string") images = [product.image];
        else if (Array.isArray(product.image)) images = product.image.filter(Boolean);

        const offers = Array.isArray(product.offers) ? product.offers[0] : product.offers;
        const price = offers && offers.price ? Number(offers.price) : null;

        const aggregate = product.aggregateRating || null;
        let rating = aggregate && aggregate.ratingValue != null ? Number(aggregate.ratingValue) : null;
        let reviewsCount = aggregate && aggregate.reviewCount != null ? Number(aggregate.reviewCount) : null;
        if (reviewsCount == null) reviewsCount = extractReviewsCountFromMl(document);

        return {
          title,
          description,
          images,
          price,
          promoPrice: null,
          rating,
          reviewsCount,
          categoryPath: [],
          categoryName: "",
          sourceUrl: location.href,
          method: "jsonld"
        };
      }
    }
    return null;
  }

  function findProduct(node) {
    if (!node || typeof node !== "object") return null;
    const t = node["@type"];
    if (typeof t === "string" && t.toLowerCase().includes("product")) return node;
    if (Array.isArray(t) && t.some((x) => String(x).toLowerCase().includes("product"))) return node;
    for (const v of Object.values(node)) {
      if (Array.isArray(v)) {
        for (const it of v) {
          const found = findProduct(it);
          if (found) return found;
        }
      } else if (v && typeof v === "object") {
        const found = findProduct(v);
        if (found) return found;
      }
    }
    return null;
  }

  function parseReviewsNumber(str) {
    if (!str || typeof str !== "string") return null;
    const raw = str.replace(/\./g, "").replace(/,/g, "");
    const num = parseInt(raw, 10);
    return Number.isFinite(num) && num > 0 && num < 10000000 ? num : null;
  }

  function extractReviewsCountFromMl(doc) {
    const d = doc || document;
    let best = 0;
    const capabilityRoot = d.querySelector("#reviews_capability_v3");
    if (capabilityRoot) {
      const labelEl = capabilityRoot.querySelector("p.ui-review-capability__rating__label");
      if (labelEl) {
        const m = (labelEl.textContent || "").match(/([\d.,]+)\s*avaliações?/i);
        if (m) {
          const n = parseReviewsNumber(m[1]);
          if (n && n > best) best = n;
        }
      }
      if (!best) {
        const ps = capabilityRoot.querySelectorAll("p, span, div");
        for (const el of ps) {
          const text = (el.textContent || "").trim();
          if (!/avalia/i.test(text)) continue;
          const m = text.match(/([\d.,]+)\s*avaliações?/i) || text.match(/([\d.,]+)/);
          if (m) {
            const n = parseReviewsNumber(m[1]);
            if (n && n > best) best = n;
          }
        }
      }
    }
    const labelEls = d.querySelectorAll(".ui-review-capability__rating__label");
    for (const el of labelEls) {
      const m = (el.textContent || "").match(/([\d.,]+)\s*avaliações?/i);
      if (m) {
        const n = parseReviewsNumber(m[1]);
        if (n && n > best) best = n;
      }
    }
    const bodyText = d.body ? d.body.innerText : "";
    const re = /([\d.,]+)\s*avaliações?/gi;
    let match;
    while ((match = re.exec(bodyText))) {
      const n = parseReviewsNumber(match[1]);
      if (n && n > best) best = n;
    }
    const headerInfo = d.querySelector(".ui-pdp-header__info");
    if (headerInfo) {
      const els = headerInfo.querySelectorAll(".ui-pdp-review__amount");
      for (const el of els) {
        const text = (el.textContent || "").trim();
        const inParens = text.match(/\(([\d.,]+)\)/);
        const plain = text.match(/[\d.,]+/);
        const raw = inParens ? inParens[1] : plain ? plain[0] : null;
        if (raw) {
          const n = parseReviewsNumber(raw);
          if (n && n > best) best = n;
        }
      }
    }
    return best > 0 ? best : null;
  }

  function extractFromDom() {
    const h1 = document.querySelector("h1");
    const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute("content");
    const title = normalizeText(h1?.textContent || ogTitle || "");

    const breadcrumb = [];
    const nav = document.querySelector("nav");
    const ol = nav ? nav.querySelector("ol") : document.querySelector("ol");
    if (ol) {
      const lis = Array.from(ol.querySelectorAll("li"));
      for (const li of lis) {
        const txt = normalizeText(li.textContent);
        if (txt) breadcrumb.push(txt);
      }
    }
    const categoryPath = breadcrumb;
    const categoryName = breadcrumb.length ? breadcrumb[breadcrumb.length - 1] : "";

    const bodyText = document.body ? document.body.innerText : "";
    const promo = findPromoAndPrice(bodyText);

    const imgs = Array.from(document.images || [])
      .map((i) => i.currentSrc || i.src)
      .filter((u) => u && /^https?:\/\//.test(u))
      .filter((u) => !u.includes("data:"))
      .slice(0, 12);

    const reviewsCount = extractReviewsCountFromMl(document);

    return {
      title: title || null,
      description: null,
      images: imgs,
      price: promo.price,
      promoPrice: promo.promoPrice,
      rating: null,
      reviewsCount,
      categoryPath,
      categoryName,
      sourceUrl: location.href,
      method: "dom"
    };
  }

  function findPromoAndPrice(text) {
    const snippet = String(text || "").slice(0, 12000);
    const re = /(de\s*)?(R\$\s*[\d\.]+,\d{2})/gi;
    const found = [];
    let m;
    while ((m = re.exec(snippet))) {
      const isOld = !!m[1];
      const n = parseBRL(m[2]);
      if (n != null) found.push({ n, isOld });
      if (found.length >= 6) break;
    }

    // Heurística:
    // - se houver valor marcado como "de", trata como price (antigo) e o menor como promo
    const olds = found.filter((x) => x.isOld).map((x) => x.n);
    const news = found.filter((x) => !x.isOld).map((x) => x.n);

    if (olds.length && news.length) {
      const price = Math.max(...olds);
      const promoPrice = Math.min(...news);
      if (promoPrice < price) return { price, promoPrice };
    }

    // fallback: pega dois primeiros valores e considera menor como promo, maior como price
    const nums = found.map((x) => x.n);
    if (nums.length >= 2) {
      const a = nums[0];
      const b = nums[1];
      const price = Math.max(a, b);
      const promoPrice = Math.min(a, b);
      if (promoPrice < price) return { price, promoPrice };
      return { price, promoPrice: null };
    }
    if (nums.length === 1) return { price: nums[0], promoPrice: null };
    return { price: null, promoPrice: null };
  }

  function extractFromRegex() {
    const text = document.body ? document.body.innerText : "";
    const promo = findPromoAndPrice(text);
    return {
      title: null,
      description: null,
      images: [],
      price: promo.price,
      promoPrice: promo.promoPrice,
      rating: null,
      reviewsCount: null,
      categoryPath: [],
      categoryName: "",
      sourceUrl: location.href,
      method: "regex"
    };
  }

  function extract() {
    return (
      extractFromJsonLd() ||
      extractFromDom() ||
      extractFromRegex()
    );
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.type === "ZUNI_EXTRACT") {
      try {
        sendResponse({ ok: true, data: extract() });
      } catch (e) {
        sendResponse({ ok: false, error: String(e && e.message ? e.message : e) });
      }
    }
    return true;
  });
})();

