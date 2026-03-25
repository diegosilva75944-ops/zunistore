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

  function extractPricesFromMlDom(doc) {
    // Preferir exatamente o bloco pedido: ui-pdp-container__row--price
    // onde 1ª linha = preço normal, 2ª linha = promo (se existir) e 3ª linha = cartão/parcelas.
    const priceRow =
      doc.querySelector(".ui-pdp-container__row--price") ||
      doc.querySelector(".ui-pdp-container__row.ui-pdp-container__row--price");

    if (priceRow) {
      const amountEls = Array.from(priceRow.querySelectorAll(".andes-money-amount"));
      const amounts = [];
      for (const el of amountEls) {
        const n = parseAndesMoney(el);
        if (n != null && n > 0) amounts.push(n);
        if (amounts.length >= 3) break;
      }

      const price = amounts[0];
      const promoLine = amounts[1];
      if (price != null) {
        const promoPrice = promoLine != null && promoLine < price ? promoLine : null;
        return { price, promoPrice };
      }
    }

    // Preferir o componente principal de preço que pode ter até 3 linhas:
    // 1ª linha: preço normal
    // 2ª linha: preço promocional (quando existir)
    // 3ª linha: preço no cartão (quando existir)
    const mainContainer =
      doc.querySelector(".ui-pdp-price__main-container") || doc.querySelector(".ui-pdp-price");

    if (mainContainer) {
      const amountEls = Array.from(mainContainer.querySelectorAll(".andes-money-amount"))
        .filter((el) => !el.classList.contains("andes-money-amount--previous"));

      const amounts: number[] = [];
      for (const el of amountEls) {
        const n = parseAndesMoney(el);
        if (n != null && n > 0) amounts.push(n);
        if (amounts.length >= 3) break;
      }

      const line1 = amounts[0];
      if (line1 != null) {
        // A 3ª linha costuma ser o valor da parcela no cartão (ex: "6x de R$39,33"),
        // então o promo_price correto (preço promocional) vem da 2ª linha.
        const promoLine = amounts[1];
        const promoPrice = promoLine != null && promoLine < line1 ? promoLine : null;
        return { price: line1, promoPrice };
      }
    }

    // Fallback (lógica antiga) para casos onde o ML não renderiza o componente esperado.
    let originalPrice = null;
    let promoPrice = null;

    const originalEl = doc.querySelector("s.ui-pdp-price__original-value") ||
      doc.querySelector(".ui-pdp-price__original-value") ||
      doc.querySelector("s.andes-money-amount--previous") ||
      doc.querySelector(".andes-money-amount--previous");

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
      const secondLine = doc.querySelector(".ui-pdp-price__second-line");
      if (secondLine) {
        const promoEl = secondLine.querySelector(".andes-money-amount:not(.andes-money-amount--previous)");
        if (promoEl) promoPrice = parseAndesMoney(promoEl);
      }
    }

    if (promoPrice == null) {
      const promoEl = doc.querySelector('[itemprop="offers"] .andes-money-amount');
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
      const bodyText = document.body ? document.body.innerText : "";
      promo = findPromoAndPrice(bodyText);
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

    return {
      title: title || null,
      description: null,
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

