const $ = (id) => document.getElementById(id);

function setStatus(text, isError = false) {
  const el = $("status");
  el.style.display = "block";
  el.textContent = text;
  el.className = "status" + (isError ? " error" : "");
}

async function getOptions() {
  return await chrome.storage.sync.get(["baseUrl", "token"]);
}

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

function findPromoAndPrice(text) {
  const snippet = String(text || "").slice(0, 15000);
  const re = /(de\s*)?(R\$\s*[\d\.]+,\d{2})/gi;
  const found = [];
  let m;
  while ((m = re.exec(snippet))) {
    const isOld = !!m[1];
    const n = parseBRL(m[2]);
    if (n != null) found.push({ n, isOld });
    if (found.length >= 10) break;
  }
  const olds = found.filter((x) => x.isOld).map((x) => x.n);
  const news = found.filter((x) => !x.isOld).map((x) => x.n);
  if (olds.length && news.length) {
    const price = Math.max(...olds);
    const promoPrice = Math.min(...news);
    if (promoPrice < price) return { price, promoPrice };
  }
  const nums = found.map((x) => x.n);
  if (nums.length >= 2) {
    const sorted = [...new Set(nums)].sort((a, b) => b - a);
    const price = sorted[0];
    const promoPrice = sorted[1];
    if (promoPrice < price) return { price, promoPrice };
  }
  if (nums.length === 1) return { price: nums[0], promoPrice: null };
  return { price: null, promoPrice: null };
}

function extractDescriptionFromMl(doc) {
  const el = doc.querySelector('p[data-testid="content"].ui-pdp-description__content') ||
    doc.querySelector('[data-testid="content"].ui-pdp-description__content') ||
    doc.querySelector('.ui-pdp-description__content');
  return el ? normalizeText(el.textContent) : null;
}

function extractImagesFromMlDom(doc) {
  const isMlImage = (u) => u && (u.includes("mlstatic.com") || u.includes("mercadolivre"));
  const normalizeUrl = (u) => {
    if (!u || typeof u !== "string") return u;
    u = u.trim();
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

  const getMlImageId = (url) => {
    const m = String(url || "").match(/\/(\d+-[A-Z0-9]+_\d+)(?:[-.]|[-.a-z0-9]*\.(webp|jpg|jpeg|png))/i);
    return m ? m[1] : null;
  };
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
        const d = descriptor.trim();
        if (d.endsWith("x")) {
          const n = parseFloat(d.slice(0, -1));
          if (Number.isFinite(n)) score = 10000 * n;
        } else if (d.endsWith("w")) {
          const n = parseInt(d.slice(0, -1), 10);
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

  const orderedFromFigures = [];
  const allCandidatesById = {};
  const orderedIdsFromHtml = [];

  const addCandidate = (u) => {
    u = normalizeUrl(u);
    if (!isValidUrl(u)) return;
    const id = getMlImageId(u);
    if (!id) return;
    const score = resolutionScore(u);
    if (!allCandidatesById[id] || score > resolutionScore(allCandidatesById[id])) {
      allCandidatesById[id] = u;
    }
  };

  const collectOrderedFromFigures = () => {
    const gallery = doc.querySelector(".ui-pdp-gallery");
    const figures = gallery ? gallery.querySelectorAll(".ui-pdp-gallery__figure") : doc.querySelectorAll(".ui-pdp-gallery__figure");
    for (const fig of figures) {
      let best = null;
      const fromFigure = fig.getAttribute("data-zoom") || fig.getAttribute("data-src") || fig.getAttribute("data-url");
      if (fromFigure && isValidUrl(fromFigure)) best = fromFigure;
      const img = fig.querySelector("img");
      if (img) {
        const zoom = img.getAttribute("data-zoom");
        const dataSrc = img.getAttribute("data-src") || img.getAttribute("data-lazy");
        const src = img.src || img.currentSrc;
        const srcset = img.getAttribute("srcset");
        const fromSrcset = pickBestFromSrcset(srcset);
        if (!best && zoom && isValidUrl(zoom)) best = zoom;
        if (!best && fromSrcset && isValidUrl(fromSrcset)) best = fromSrcset;
        if (!best && dataSrc && isValidUrl(dataSrc)) best = dataSrc;
        if (!best && src && isValidUrl(src)) best = src;
      }
      const source = fig.querySelector("source");
      if (source && !best) {
        const s = source.getAttribute("srcset") || source.getAttribute("src");
        if (s) best = (s.split(",")[0]?.trim().split(/\s+/)[0] || s).trim();
        if (best && !isValidUrl(best)) best = null;
      }
      if (best) {
        orderedFromFigures.push(best);
        addCandidate(best);
      }
    }
  };

  const collectFromGalleryHtml = () => {
    const gallery = doc.querySelector(".ui-pdp-gallery");
    if (!gallery) return;
    const html = gallery.innerHTML;
    const re = /(?:data-zoom|data-src|data-url)=["'](https?:\/\/[^"']*mlstatic\.com\/[^"']+)["']/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
      const url = normalizeUrl(m[1]);
      if (!isValidUrl(url)) continue;
      addCandidate(url);
      const id = getMlImageId(url);
      if (id && orderedIdsFromHtml.indexOf(id) === -1) orderedIdsFromHtml.push(id);
    }
  };

  collectOrderedFromFigures();
  collectFromGalleryHtml();

  const result = [];
  if (orderedIdsFromHtml.length > 0) {
    for (const id of orderedIdsFromHtml) {
      if (allCandidatesById[id]) result.push(allCandidatesById[id]);
    }
  } else {
    const seenIds = new Set();
    for (const url of orderedFromFigures) {
      const id = getMlImageId(url);
      if (id && !seenIds.has(id)) {
        seenIds.add(id);
        result.push(allCandidatesById[id] || url);
      }
    }
    Object.keys(allCandidatesById).filter((id) => !seenIds.has(id)).forEach((id) => result.push(allCandidatesById[id]));
  }

  if (result.length > 0) {
    return result.length > 30 ? result.slice(0, 30) : result;
  }

  if (orderedFromFigures.length === 0 && Object.keys(allCandidatesById).length === 0) {
    const gallery = doc.querySelector(".ui-pdp-gallery");
    if (gallery) {
      const imgs = gallery.querySelectorAll("img");
      for (const img of imgs) {
        const zoom = img.getAttribute("data-zoom");
        const src = img.src || img.currentSrc || img.getAttribute("data-src");
        if (zoom) addCandidate(zoom);
        if (src) addCandidate(src);
      }
    }
  }

  if (Object.keys(allCandidatesById).length === 0) {
    Array.from(doc.images || []).forEach((img) => {
      const src = img.src || img.currentSrc;
      if (src && isMlImage(src)) addCandidate(src);
    });
  }

  if (Object.keys(allCandidatesById).length === 0 && doc.documentElement) {
    const raw = doc.documentElement.outerHTML;
    const re = /https?:\/\/[^"'\s]*mlstatic\.com\/[^"'\s]+\.(webp|jpg|jpeg|png)/gi;
    let m;
    while ((m = re.exec(raw)) !== null) {
      addCandidate(m[0]);
    }
  }

  if (orderedIdsFromHtml.length > 0) {
    for (const id of orderedIdsFromHtml) {
      if (allCandidatesById[id]) result.push(allCandidatesById[id]);
    }
  } else {
    const seenIds2 = new Set();
    for (const url of orderedFromFigures) {
      const id = getMlImageId(url);
      if (id && !seenIds2.has(id)) {
        seenIds2.add(id);
        result.push(allCandidatesById[id] || url);
      }
    }
    Object.keys(allCandidatesById).filter((id) => !seenIds2.has(id)).forEach((id) => result.push(allCandidatesById[id]));
  }

  return result.length > 30 ? result.slice(0, 30) : result;
}

function parseReviewsNumber(str) {
  if (!str || typeof str !== "string") return null;
  const raw = str.replace(/\./g, "").replace(/,/g, "");
  const num = parseInt(raw, 10);
  return Number.isFinite(num) && num > 0 && num < 10000000 ? num : null;
}

function extractReviewsCountFromMl(doc) {
  let best = 0;

  // 1) #reviews_capability_v3 > ... > p (ex: "19.304 avaliações")
  const capabilityRoot = doc.querySelector("#reviews_capability_v3");
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

  // 2) Qualquer .ui-review-capability__rating__label no documento
  const labelEls = doc.querySelectorAll(".ui-review-capability__rating__label, p.ui-review-capability__rating__label");
  for (const el of labelEls) {
    const m = (el.textContent || "").match(/([\d.,]+)\s*avaliações?/i);
    if (m) {
      const n = parseReviewsNumber(m[1]);
      if (n && n > best) best = n;
    }
  }

  // 3) Busca em todo o body: "X.XXX avaliações" (formato BR)
  const bodyText = doc.body ? doc.body.innerText : "";
  const re = /([\d.,]+)\s*avaliações?/gi;
  let match;
  while ((match = re.exec(bodyText))) {
    const n = parseReviewsNumber(match[1]);
    if (n && n > best) best = n;
  }

  // 4) Busca em scripts/JSON (reviewCount, total_reviews, etc)
  const html = doc.documentElement ? doc.documentElement.outerHTML : "";
  const jsonMatches = html.match(/"reviewCount"\s*:\s*(\d+)/gi) ||
    html.match(/"total_reviews"\s*:\s*(\d+)/gi) ||
    html.match(/"reviews_count"\s*:\s*(\d+)/gi);
  if (jsonMatches) {
    for (const m of jsonMatches) {
      const numMatch = m.match(/(\d+)/);
      if (numMatch) {
        const n = parseInt(numMatch[1], 10);
        if (n > best && n < 10000000) best = n;
      }
    }
  }

  // 5) Fallback: ui-pdp-header__info > .ui-pdp-review__amount
  const headerInfo = doc.querySelector(".ui-pdp-header__info");
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

  // Preferir o componente principal de preço que pode ter até 3 linhas.
  const mainContainer =
    doc.querySelector(".ui-pdp-price__main-container") || doc.querySelector(".ui-pdp-price");

  if (mainContainer) {
    const amountEls = Array.from(mainContainer.querySelectorAll(".andes-money-amount"))
      .filter((el) => !el.classList.contains("andes-money-amount--previous"));

    const amounts = [];
    for (const el of amountEls) {
      const n = parseAndesMoney(el);
      if (n != null && n > 0) amounts.push(n);
      if (amounts.length >= 3) break;
    }

    const line1 = amounts[0];
    if (line1 != null) {
      // A 3ª linha pode trazer o valor da parcela no cartão (ex: "6x de R$39,33"),
      // então o promo_price correto (preço promocional) vem da 2ª linha.
      const promoLine = amounts[1];
      const promoPrice = promoLine != null && promoLine < line1 ? promoLine : null;
      return { price: line1, promoPrice };
    }
  }

  // Fallback (lógica antiga)
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

  const bodyText = doc.body?.innerText || "";
  return findPromoAndPrice(bodyText);
}

function extractFromDocument(doc, sourceUrl) {
  function fromJsonLd() {
    const scripts = Array.from(doc.querySelectorAll('script[type="application/ld+json"]'));
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
        let description = product.description ? normalizeText(product.description) : null;
        if (!description) description = extractDescriptionFromMl(doc);
        let images = [];
        if (typeof product.image === "string") images = [product.image];
        else if (Array.isArray(product.image)) images = product.image.filter(Boolean);
        const domImages = extractImagesFromMlDom(doc);
        if (domImages.length > images.length) images = domImages;
        const offers = Array.isArray(product.offers) ? product.offers[0] : product.offers;
        let price = null;
        let promoPrice = null;
        if (offers) {
          const p = offers.price != null ? Number(offers.price) : null;
          const high = offers.highPrice != null ? Number(offers.highPrice) : null;
          const low = offers.lowPrice != null ? Number(offers.lowPrice) : null;
          if (high != null && low != null && high > low) {
            price = high;
            promoPrice = low;
          } else if (p != null) {
            price = p;
            promoPrice = null;
          }
        }
        if (price == null && offers) {
          const p = offers.price != null ? Number(offers.price) : null;
          if (p != null) price = p;
        }
        const aggregate = product.aggregateRating || null;
        let rating = aggregate && aggregate.ratingValue != null ? Number(aggregate.ratingValue) : null;
        let reviewsCount = aggregate && aggregate.reviewCount != null ? Number(aggregate.reviewCount) : null;
        if (reviewsCount == null) reviewsCount = extractReviewsCountFromMl(doc);
        return {
          title,
          description,
          images,
          price,
          promoPrice,
          rating,
          reviewsCount,
          categoryPath: [],
          categoryName: "",
          sourceUrl,
          method: "jsonld",
        };
      }
    }
    return null;
  }

  function fromDom() {
    const h1 = doc.querySelector("h1");
    const ogTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute("content");
    const title = normalizeText(h1?.textContent || ogTitle || "");
    const description = extractDescriptionFromMl(doc);
    const breadcrumb = [];
    const nav = doc.querySelector("nav");
    const ol = nav ? nav.querySelector("ol") : doc.querySelector("ol");
    if (ol) {
      const lis = Array.from(ol.querySelectorAll("li"));
      for (const li of lis) {
        const txt = normalizeText(li.textContent);
        if (txt) breadcrumb.push(txt);
      }
    }
    const categoryPath = breadcrumb;
    const categoryName = breadcrumb.length ? breadcrumb[breadcrumb.length - 1] : "";
    let promo = extractPricesFromMlDom(doc);
    if (!promo) {
      const bodyText = doc.body ? doc.body.innerText : "";
      promo = findPromoAndPrice(bodyText);
    }
    let imgs = extractImagesFromMlDom(doc);
    if (imgs.length === 0) {
      imgs = Array.from(doc.images || [])
        .map((i) => i.currentSrc || i.src)
        .filter((u) => u && /^https?:\/\//.test(u))
        .filter((u) => !u.includes("data:") && (u.includes("mlstatic") || u.includes("mercadolivre")))
        .slice(0, 20);
    }
    const reviewsCount = extractReviewsCountFromMl(doc);
    return {
      title: title || null,
      description,
      images: imgs,
      price: promo.price,
      promoPrice: promo.promoPrice,
      rating: null,
      reviewsCount,
      categoryPath,
      categoryName,
      sourceUrl,
      method: "dom",
    };
  }

  function fromRegex() {
    const bodyText = doc.body ? doc.body.innerText : "";
    const promo = findPromoAndPrice(bodyText);
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
      sourceUrl,
      method: "regex",
    };
  }

  const jsonResult = fromJsonLd();
  if (jsonResult) {
    const domPrices = extractPricesFromMlDom(doc);
    if (domPrices && domPrices.price != null && domPrices.promoPrice != null) {
      jsonResult.price = domPrices.price;
      jsonResult.promoPrice = domPrices.promoPrice;
    } else if (domPrices && domPrices.price != null && jsonResult.price != null && domPrices.price > jsonResult.price) {
      jsonResult.promoPrice = jsonResult.price;
      jsonResult.price = domPrices.price;
    } else if (jsonResult.price != null && jsonResult.promoPrice == null) {
      const textPrices = findPromoAndPrice(doc.body?.innerText || "");
      if (textPrices && textPrices.price != null && textPrices.promoPrice != null) {
        jsonResult.price = textPrices.price;
        jsonResult.promoPrice = textPrices.promoPrice;
      }
    }
    return jsonResult;
  }
  return fromDom() || fromRegex();
}

async function fetchAndExtract(productUrl) {
  // Se a aba ativa for a página do produto ML, usa o content script (DOM renderizado)
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const tabUrl = tab?.url || "";
  const isSameUrl = tabUrl && productUrl && (
    tabUrl.split("?")[0] === productUrl.split("?")[0] ||
    tabUrl.startsWith(productUrl.split("?")[0])
  );
  if (isSameUrl && isValidMercadoLivreUrl(tabUrl)) {
    try {
      const resp = await chrome.tabs.sendMessage(tab.id, { type: "ZUNI_EXTRACT" });
      if (resp?.ok && resp?.data) {
        resp.data.sourceUrl = productUrl;
        return resp.data;
      }
    } catch (_) {
      // Content script não disponível, continua com fetch
    }
  }

  const res = await fetch(productUrl, { credentials: "omit" });
  if (!res.ok) throw new Error(`Não foi possível acessar a página (${res.status}).`);
  const html = await res.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const data = extractFromDocument(doc, productUrl);
  if (!data) throw new Error("Não foi possível extrair dados do produto desta página.");
  return data;
}

async function importProduct(baseUrl, token, payload) {
  const url = baseUrl.replace(/\/+$/, "") + "/api/admin/import/mercadolivre";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Erro ${res.status}`);
  return data;
}

function isValidMercadoLivreUrl(url) {
  try {
    const u = new URL(url);
    return u.hostname.endsWith("mercadolivre.com.br");
  } catch {
    return false;
  }
}

async function initPopup() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const productUrlSection = $("productUrlSection");
  const productUrlInput = $("productUrl");
  const changeUrlBtn = $("changeUrl");

  if (tab?.url && isValidMercadoLivreUrl(tab.url)) {
    productUrlInput.value = tab.url;
    productUrlSection.style.display = "none";
  } else {
    productUrlSection.style.display = "block";
    productUrlInput.removeAttribute("readonly");
  }

  changeUrlBtn.addEventListener("click", () => {
    productUrlSection.style.display = "block";
    productUrlInput.removeAttribute("readonly");
    productUrlInput.focus();
  });
}

async function main() {
  await initPopup();

  $("openOptions").addEventListener("click", async (e) => {
    e.preventDefault();
    if (chrome.runtime.openOptionsPage) chrome.runtime.openOptionsPage();
  });

  $("importBtn").addEventListener("click", async () => {
    const productUrl = $("productUrl").value.trim();
    const affiliateUrl = $("affiliateUrl").value.trim();

    if (!productUrl) return setStatus("Abra uma página de produto do Mercado Livre ou cole a URL acima.", true);
    if (!affiliateUrl) return setStatus("Informe o link de afiliado (botão Comprar).", true);

    if (!isValidMercadoLivreUrl(productUrl)) {
      return setStatus("A URL deve ser de uma página de produto do Mercado Livre (mercadolivre.com.br/.../p/...).", true);
    }

    try {
      const affiliateUrlParsed = new URL(affiliateUrl);
      if (!/^https?:$/.test(affiliateUrlParsed.protocol)) {
        return setStatus("O link de afiliado deve começar com http:// ou https://", true);
      }
    } catch {
      return setStatus("O link de afiliado não é uma URL válida.", true);
    }

    const { baseUrl, token } = await getOptions();
    if (!baseUrl || !token) {
      return setStatus("Configure Base URL e Token nas Opções.", true);
    }

    try {
      $("importBtn").disabled = true;
      setStatus("Buscando dados do produto…");

      const extracted = await fetchAndExtract(productUrl);

      const payload = {
        title: extracted.title || "Produto",
        description: extracted.description || "",
        images: extracted.images || [],
        price: extracted.price,
        promoPrice: extracted.promoPrice,
        rating: extracted.rating,
        reviewsCount: extracted.reviewsCount,
        categoryPath: extracted.categoryPath || [],
        categoryName: extracted.categoryName || "",
        affiliateUrl,
        sourceUrl: extracted.sourceUrl || productUrl,
      };

      if (!payload.price) {
        throw new Error("Não foi possível identificar o preço do produto.");
      }

      setStatus("Enviando para o ZuniStore…");
      const result = await importProduct(baseUrl, token, payload);

      const productLink = baseUrl.replace(/\/+$/, "") + (result.productUrl || `/produto/${result.code6}`);
      setStatus(`Importado! Código: ${result.code6}. Abra o produto no site para ver fotos e botão Comprar.`);
    } catch (e) {
      setStatus(String(e?.message || e), true);
    } finally {
      $("importBtn").disabled = false;
    }
  });
}

main();
