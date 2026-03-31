/// JavaScript executado na WebView para ler preço do JSON-LD (Product).
const String kExtractPriceJsonLd = r'''
(function() {
  try {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const s of scripts) {
      let data;
      try { data = JSON.parse(s.textContent || ''); } catch (e) { continue; }
      const candidates = [];
      if (Array.isArray(data)) candidates.push(...data);
      else if (data && data['@graph'] && Array.isArray(data['@graph'])) candidates.push(...data['@graph']);
      else candidates.push(data);
      for (const node of candidates) {
        if (!node || node['@type'] !== 'Product') continue;
        const offers = node.offers;
        if (!offers) continue;
        const o = Array.isArray(offers) ? offers[0] : offers;
        const raw = o.price;
        const price = typeof raw === 'number' ? raw : parseFloat(String(raw).replace(',', '.'));
        if (Number.isFinite(price) && price > 0) {
          return JSON.stringify({
            ok: true,
            price: price,
            title: typeof node.name === 'string' ? node.name : null
          });
        }
      }
    }
  } catch (e) {}
  return JSON.stringify({ ok: false, error: 'jsonld_price_not_found' });
})();
''';
