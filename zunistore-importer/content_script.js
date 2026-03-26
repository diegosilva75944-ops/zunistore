(() => {
  function normalizeText(s) {
    return String(s || "").replace(/\s+/g, " ").trim();
  }

  function normalizeDescriptionBlockText(s) {
    return String(s || "")
      .replace(/\r\n/g, "\n")
      .replace(/[ \t\f\v]+/g, " ")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function parseBRL(text) {
    const m = String(text || "").match(/R\$\s*([\d\.]+,\d{2})/);
    if (!m) return null;
    const raw = m[1].replace(/\./g, "").replace(",", ".");
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  function parseAndesMoney(el) {
    if (!el) return null;
    const fraction = el.querySelector(".andes-money-amount__fraction")?.textContent?.trim();
    const cents = el.querySelector(".andes-money-amount__cents")?.textContent?.trim();
    if (!fraction) return null;
    const fractionNum = fraction.replace(/\./g, "");
    const dec = cents && /^\d{1,2}$/.test(cents) ? cents.padStart(2, "0") : "00";
    const n = parseFloat(`${fractionNum}.${dec}`);
    return Number.isFinite(n) ? n : null;
  }

  function parseAndesMoneyFromFractionCents(fracEl, centsEl) {
    if (!fracEl || !centsEl) return null;
    const fraction = fracEl.textContent?.trim();
    const cents = centsEl.textContent?.trim();
    if (!fraction) return null;
    const fractionNum = fraction.replace(/\./g, "");
    const dec = cents && /^\d{1,2}$/.test(cents) ? cents.padStart(2, "0") : "00";
    const n = parseFloat(`${fractionNum}.${dec}`);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  function parseMlAriaLabelReaisCentavos(label) {
    const s = String(label ?? "")
      .trim()
      .replace(/\s+/g, " ");
    if (!s) return null;
    let m = s.match(/^Antes:\s*([\d.]+)\s*reais(?:\s*com\s*(\d+)\s*centavos?)?$/i);
    if (m) {
      const reais = Number(String(m[1]).replace(/\./g, ""));
      const centavos = m[2] ? Number(m[2]) : 0;
      if (Number.isFinite(reais) && Number.isFinite(centavos)) {
        const v = reais + centavos / 100;
        return v > 0 ? v : null;
      }
    }
    m = s.match(/^([\d.]+)\s*reais\s*com\s*(\d+)\s*centavos?$/i);
    if (m) {
      const reais = Number(String(m[1]).replace(/\./g, ""));
      const centavos = Number(m[2]);
      if (Number.isFinite(reais) && Number.isFinite(centavos)) {
        const v = reais + centavos / 100;
        return v > 0 ? v : null;
      }
    }
    return null;
  }

  function collectAriaLabelPricesFromContainer(container) {
    const MIN = 3;
    const seq = [];
    const nodes = container.querySelectorAll("[aria-label]");
    for (const el of nodes) {
      const label = el.getAttribute("aria-label");
      if (!label) continue;
      const v = parseMlAriaLabelReaisCentavos(label);
      if (v != null && v >= MIN) {
        if (seq.length === 0 || Math.abs(seq[seq.length - 1] - v) > 0.009) seq.push(v);
      }
      if (seq.length >= 3) break;
    }
    return seq;
  }

  function filterTopLevelAndesMoney(container) {
    const all = Array.from(container.querySelectorAll(".andes-money-amount"));
    return all.filter((el) => {
      let p = el.parentElement;
      while (p && container.contains(p)) {
        if (p !== container && p.classList && p.classList.contains("andes-money-amount")) return false;
        p = p.parentElement;
      }
      return true;
    });
  }

  function collectAmountsFromPriceBlock(container) {
    const topLevel = filterTopLevelAndesMoney(container);
    const amounts = [];
    for (const el of topLevel) {
      const n = parseAndesMoney(el);
      if (n != null && n > 0) amounts.push(n);
      if (amounts.length >= 3) break;
    }
    if (amounts.length > 0) return amounts;

    const fractions = Array.from(container.querySelectorAll(".andes-money-amount__fraction"));
    for (const f of fractions) {
      if (isInsideOtherSellers(f)) continue;
      const parent = f.closest(".andes-money-amount");
      if (parent) {
        const n = parseAndesMoney(parent);
        if (n != null && n > 0) amounts.push(n);
      } else {
        const next = f.nextElementSibling;
        if (next && next.classList && next.classList.contains("andes-money-amount__cents")) {
          const n = parseAndesMoneyFromFractionCents(f, next);
          if (n != null && n > 0) amounts.push(n);
        }
      }
      if (amounts.length >= 3) break;
    }
    return amounts;
  }

  function isInsideOtherSellers(el) {
    if (!el || typeof el.closest !== "function") return false;
    try {
      return !!el.closest("[class*='other-sellers']");
    } catch {
      return false;
    }
  }

  function firstElementNotInOtherSellers(doc, selector) {
    const nodes = doc.querySelectorAll(selector);
    for (const n of nodes) {
      if (!isInsideOtherSellers(n)) return n;
    }
    return null;
  }

  function getBodyInnerTextExcludingOtherSellers(doc) {
    const body = doc.body;
    if (!body) return "";
    try {
      const clone = body.cloneNode(true);
      let node;
      let guard = 0;
      while (guard++ < 200 && (node = clone.querySelector("[class*='other-sellers']"))) {
        node.remove();
      }
      return clone.innerText || "";
    } catch {
      return body.innerText || "";
    }
  }

  function pairHighLowFromValues(vals) {
    const nums = (vals || []).filter((n) => Number.isFinite(n) && n > 0);
    if (nums.length === 0) return null;
    if (nums.length === 1) return { price: nums[0], promoPrice: null };
    const hi = Math.max(...nums);
    const lo = Math.min(...nums);
    if (lo < hi) return { price: hi, promoPrice: lo };
    return { price: hi, promoPrice: null };
  }

  function extractPricesFromMlDom(doc) {
    const mainContainer =
      firstElementNotInOtherSellers(doc, ".ui-pdp-price__main-container") ||
      firstElementNotInOtherSellers(doc, ".ui-pdp-price");

    if (mainContainer) {
      const ar = collectAriaLabelPricesFromContainer(mainContainer);
      if (ar.length >= 1) {
        const p = pairHighLowFromValues(ar);
        if (p) return p;
      }
      const amounts = collectAmountsFromPriceBlock(mainContainer);
      if (amounts.length >= 1) {
        const p = pairHighLowFromValues(amounts);
        if (p) return p;
      }
    }

    const priceRow = firstElementNotInOtherSellers(
      doc,
      ".ui-pdp-container__row--price, .ui-pdp-container__row.ui-pdp-container__row--price",
    );

    if (priceRow) {
      const ar = collectAriaLabelPricesFromContainer(priceRow);
      if (ar.length >= 1) {
        const p = pairHighLowFromValues(ar);
        if (p) return p;
      }
      const amounts = collectAmountsFromPriceBlock(priceRow);
      if (amounts.length >= 1) {
        const p = pairHighLowFromValues(amounts);
        if (p) return p;
      }
    }

    // Fallback (lógica antiga) para casos onde o ML não renderiza o componente esperado.
    let originalPrice = null;
    let promoPrice = null;

    const originalSelectors = [
      "s.ui-pdp-price__original-value",
      ".ui-pdp-price__original-value",
      "s.andes-money-amount--previous",
      ".andes-money-amount--previous",
    ];
    let originalEl = null;
    for (const sel of originalSelectors) {
      const els = doc.querySelectorAll(sel);
      for (const el of els) {
        if (!isInsideOtherSellers(el)) {
          originalEl = el;
          break;
        }
      }
      if (originalEl) break;
    }

    if (originalEl) {
      originalPrice = parseAndesMoney(originalEl);
      if (originalPrice == null) {
        const label = originalEl.getAttribute("aria-label") || "";
        const m = label.match(/(\d+)\s*reais?\s*(?:com\s*)?(\d+)?\s*centavos?/i);
        if (m) {
          const reais = parseInt(m[1], 10);
          const centavos = m[2] ? parseInt(m[2], 10) : 0;
          originalPrice = reais + centavos / 100;
        } else {
          const simpleMatch = label.match(/(\d+)/);
          if (simpleMatch) originalPrice = parseFloat(simpleMatch[1]);
        }
      }
    }

    const promoMeta = doc.querySelector('meta[itemprop="price"]');
    if (promoMeta) {
      const content = promoMeta.getAttribute("content");
      if (content) promoPrice = parseFloat(content);
    }

    if (promoPrice == null) {
      const secondLine = firstElementNotInOtherSellers(doc, ".ui-pdp-price__second-line");
      if (secondLine) {
        const promoEl = secondLine.querySelector(".andes-money-amount:not(.andes-money-amount--previous)");
        if (promoEl && !isInsideOtherSellers(promoEl)) promoPrice = parseAndesMoney(promoEl);
      }
    }

    if (promoPrice == null) {
      const promoEl = firstElementNotInOtherSellers(doc, '[itemprop="offers"] .andes-money-amount');
      if (promoEl) promoPrice = parseAndesMoney(promoEl);
    }

    if (originalPrice != null && promoPrice != null && promoPrice < originalPrice) {
      return { price: originalPrice, promoPrice };
    }
    if (originalPrice != null && promoPrice == null) {
      return { price: originalPrice, promoPrice: null };
    }
    if (promoPrice != null && originalPrice == null) {
      return { price: promoPrice, promoPrice: null };
    }

    return null;
  }

  function extractImagesFromMlDom(doc) {
    const d = doc || document;
    const isMlImage = (u) => u && (u.includes("mlstatic.com") || u.includes("mercadolivre"));
    const normalizeUrl = (u) => {
      if (!u || typeof u !== "string") return u;
      u = String(u).trim();
      if (u.startsWith("//")) u = "https:" + u;
      if (u.startsWith("http://http") || u.startsWith("https://http")) {
        u = u.replace(/^https?:\/\/http/, "https://http");
      }
      return u;
    };
    const isValidUrl = (u) => {
      u = normalizeUrl(u);
      return u && isMlImage(u) && !u.includes("data:") && u.startsWith("http");
    };

    /** Maior = melhor resolução; prioriza 2X, depois F, L, B, C, O */
    const resolutionScore = (url) => {
      const u = String(url || "");
      if (/2X|2x/i.test(u)) return 1000;
      if (/-F[.-]/i.test(u)) return 500;
      if (/-L[.-]/i.test(u)) return 400;
      if (/-B[.-]/i.test(u)) return 350;
      if (/-C[.-]/i.test(u)) return 300;
      if (/-V[.-]/i.test(u)) return 200;
      if (/-O[.-]/i.test(u)) return 100;
      return 50;
    };

    const pickBestFromSrcset = (srcset) => {
      if (!srcset) return null;
      let best = null;
      let bestScore = -1;
      for (const part of srcset.split(",")) {
        const seg = part.trim();
        if (!seg) continue;
        const [url, descriptor] = seg.split(/\s+/, 2);
        if (!url) continue;
        let score = 0;
        if (descriptor) {
          const dsc = descriptor.trim();
          if (dsc.endsWith("x")) {
            const n = parseFloat(dsc.slice(0, -1));
            if (Number.isFinite(n)) score = 10000 * n;
          } else if (dsc.endsWith("w")) {
            const n = parseInt(dsc.slice(0, -1), 10);
            if (Number.isFinite(n)) score = n;
          }
        }
        if (score > bestScore) {
          bestScore = score;
          best = url;
        }
      }
      return best;
    };

    const getMlImageId = (url) => {
      const m = String(url || "").match(/\/(\d+-[A-Z0-9]+_\d+)(?:[-.]|[-.a-z0-9]*\.(webp|jpg|jpeg|png))/i);
      return m ? m[1] : null;
    };

    /** Uma URL de maior resolução por .ui-pdp-gallery__figure, na ordem da galeria */
    const figures = d.querySelectorAll(".ui-pdp-gallery__figure");
    const result = [];

    for (const fig of figures) {
      const candidates = [];

      const add = (u) => {
        u = normalizeUrl(u);
        if (isValidUrl(u)) candidates.push(u);
      };

      // Atributos do próprio figure (data-zoom costuma ser a maior resolução no ML)
      const dataZoom = fig.getAttribute("data-zoom") || fig.getAttribute("data-src") || fig.getAttribute("data-url");
      if (dataZoom) add(dataZoom);

      // img dentro do figure
      const img = fig.querySelector("img");
      if (img) {
        add(img.getAttribute("data-zoom"));
        add(img.getAttribute("data-src") || img.getAttribute("data-lazy"));
        add(img.currentSrc || img.src);
        const srcset = img.getAttribute("srcset");
        const fromSrcset = pickBestFromSrcset(srcset);
        if (fromSrcset) add(fromSrcset);
      }

      // source dentro do figure
      const source = fig.querySelector("source");
      if (source) {
        const s = source.getAttribute("srcset") || source.getAttribute("src");
        if (s) {
          for (const part of s.split(",")) {
            const seg = part.trim();
            if (!seg) continue;
            const url = seg.split(/\s+/)[0];
            if (url) add(url);
          }
        }
      }

      // Escolhe a URL de maior resolução entre os candidatos deste figure
      if (candidates.length > 0) {
        let bestUrl = candidates[0];
        let bestScore = resolutionScore(bestUrl);
        for (let i = 1; i < candidates.length; i++) {
          const u = normalizeUrl(candidates[i]);
          const score = resolutionScore(u);
          if (score > bestScore) {
            bestScore = score;
            bestUrl = u;
          }
        }
        result.push(normalizeUrl(bestUrl));
      }
    }

    /** Miniaturas / slides podem estar fora de .ui-pdp-gallery__figure mas com data-zoom. */
    const galleryRoot = d.querySelector(".ui-pdp-gallery");
    if (galleryRoot) {
      const seenIds = new Set();
      const seenUrl = new Set();
      for (const u of result) {
        const nu = normalizeUrl(u);
        const id = getMlImageId(nu);
        if (id) seenIds.add(id);
        else seenUrl.add(nu);
      }
      for (const el of galleryRoot.querySelectorAll("[data-zoom]")) {
        const u = normalizeUrl(el.getAttribute("data-zoom"));
        if (!isValidUrl(u)) continue;
        const id = getMlImageId(u);
        if (id) {
          if (seenIds.has(id)) continue;
          seenIds.add(id);
          result.push(u);
        } else {
          if (seenUrl.has(u)) continue;
          seenUrl.add(u);
          result.push(u);
        }
      }
    }

    if (result.length > 0) {
      return result.length > 30 ? result.slice(0, 30) : result;
    }

    // Fallback: se não houver .ui-pdp-gallery__figure, tenta galeria genérica
    const gallery = d.querySelector(".ui-pdp-gallery");
    if (gallery) {
      const imgs = gallery.querySelectorAll("img");
      for (const img of imgs) {
        const zoom = img.getAttribute("data-zoom");
        const src = img.currentSrc || img.src || img.getAttribute("data-src");
        if (zoom && isValidUrl(normalizeUrl(zoom))) result.push(normalizeUrl(zoom));
        else if (src && isValidUrl(normalizeUrl(src))) result.push(normalizeUrl(src));
      }
    }

    if (result.length === 0) {
      Array.from(d.images || []).forEach((img) => {
        const src = img.currentSrc || img.src;
        if (src && isMlImage(src)) result.push(normalizeUrl(src));
      });
    }

    return result.length > 30 ? result.slice(0, 30) : result;
  }

  function extractDescriptionFromMl(doc) {
    const el =
      doc.querySelector('p[data-testid="content"].ui-pdp-description__content') ||
      doc.querySelector('[data-testid="content"].ui-pdp-description__content') ||
      doc.querySelector(".ui-pdp-description__content");
    return el ? normalizeText(el.innerText || el.textContent) : null;
  }

  function extractDescriptionBlockFromMl(doc) {
    const root =
      doc.querySelector(".ui-pdp-collapsable__container #description") ||
      doc.querySelector(".ui-pdp-collapsable__container #description.ui-pdp-description") ||
      doc.querySelector(".ui-pdp-collapsable__container .ui-pdp-description") ||
      doc.querySelector("div#description.ui-pdp-description") ||
      doc.querySelector("#description.ui-pdp-description") ||
      doc.querySelector("#description") ||
      doc.querySelector(".ui-pdp-description");

    const readParagraphs = (container) => {
      const ps = container.querySelectorAll(
        'p.ui-pdp-description__content, p[data-testid="content"].ui-pdp-description__content, p[data-testid="content"]',
      );
      const parts = [];
      for (const p of ps) {
        const t = (p.innerText || p.textContent || "").trim();
        if (t) parts.push(t);
      }
      return parts.length ? parts.join("\n\n") : "";
    };

    if (root) {
      let text = readParagraphs(root);
      if (!text) {
        const pSingle =
          root.querySelector('p[data-testid="content"].ui-pdp-description__content') ||
          root.querySelector("p.ui-pdp-description__content") ||
          root.querySelector(".ui-pdp-description__content") ||
          root.querySelector('[data-testid="content"]');
        if (pSingle) text = (pSingle.innerText || pSingle.textContent || "").trim();
      }
      if (!text || text.length < 30) {
        text = (root.innerText || root.textContent || "").trim();
        text = text.replace(/^\s*Descrição\s*/i, "").trim();
      } else {
        text = text.replace(/^\s*Descrição\s*/i, "").trim();
      }
      const out = normalizeDescriptionBlockText(text);
      return out || null;
    }

    const lone =
      doc.querySelector('p[data-testid="content"].ui-pdp-description__content') ||
      doc.querySelector("p.ui-pdp-description__content") ||
      doc.querySelector(".ui-pdp-description__content");
    if (!lone) return null;
    let t = (lone.innerText || lone.textContent || "").trim();
    t = t.replace(/^\s*Descrição\s*/i, "").trim();
    const out = normalizeDescriptionBlockText(t);
    return out || null;
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
        const jsonLdDesc = product.description ? normalizeText(product.description) : null;
        const domBlock = extractDescriptionBlockFromMl(document);
        const fallbackDesc = extractDescriptionFromMl(document);
        let description = (jsonLdDesc || fallbackDesc || "").trim();
        let descriptionDetail = "";
        if (domBlock && domBlock.trim() !== description) {
          descriptionDetail = domBlock.trim();
        }

        let images = [];
        if (typeof product.image === "string") images = [product.image];
        else if (Array.isArray(product.image)) images = product.image.filter(Boolean);

        const domImages = extractImagesFromMlDom(document);
        if (domImages.length > images.length) images = domImages;

        const offers = Array.isArray(product.offers) ? product.offers[0] : product.offers;
        let jsonLdPrice = offers && offers.price ? Number(offers.price) : null;

        const aggregate = product.aggregateRating || null;
        let rating = aggregate && aggregate.ratingValue != null ? Number(aggregate.ratingValue) : null;
        let reviewsCount = aggregate && aggregate.reviewCount != null ? Number(aggregate.reviewCount) : null;
        if (reviewsCount == null) reviewsCount = extractReviewsCountFromMl(document);

        const domPrices = extractPricesFromMlDom(document);
        let finalPrice = jsonLdPrice;
        let finalPromoPrice = null;

        if (domPrices && domPrices.price != null && domPrices.promoPrice != null) {
          finalPrice = domPrices.price;
          finalPromoPrice = domPrices.promoPrice;
        } else if (domPrices && domPrices.price != null && jsonLdPrice != null && domPrices.price > jsonLdPrice) {
          finalPrice = domPrices.price;
          finalPromoPrice = jsonLdPrice;
        }

        return {
          title,
          description,
          descriptionDetail,
          images,
          price: finalPrice,
          promoPrice: finalPromoPrice,
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

    let promo = extractPricesFromMlDom(document);
    if (!promo || promo.price == null) {
      promo = findPromoAndPrice(getBodyInnerTextExcludingOtherSellers(document));
    }

    let imgs = extractImagesFromMlDom(document);
    if (!imgs.length) {
      imgs = Array.from(document.images || [])
        .map((i) => i.currentSrc || i.src)
        .filter((u) => u && /^https?:\/\//.test(u))
        .filter((u) => !u.includes("data:"))
        .slice(0, 12);
    }

    const reviewsCount = extractReviewsCountFromMl(document);

    const domBlock = extractDescriptionBlockFromMl(document);
    const fallbackDesc = extractDescriptionFromMl(document);
    let description = (fallbackDesc || domBlock || "").trim();
    let descriptionDetail = "";
    if (domBlock && domBlock.trim() !== description) {
      descriptionDetail = domBlock.trim();
    }

    return {
      title: title || null,
      description,
      descriptionDetail,
      images: imgs,
      price: promo?.price ?? null,
      promoPrice: promo?.promoPrice ?? null,
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
    const promo = findPromoAndPrice(getBodyInnerTextExcludingOtherSellers(document));
    return {
      title: null,
      description: null,
      descriptionDetail: "",
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

