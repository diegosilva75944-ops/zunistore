function normalizeBaseUrl(u) {
  return String(u || "")
    .trim()
    .replace(/\/+$/, "");
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function waitTabComplete(tabId, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      try {
        chrome.tabs.onUpdated.removeListener(onUp);
      } catch (e) {
        /* ignore */
      }
      reject(new Error("Tempo esgotado ao carregar a aba do Mercado Livre."));
    }, timeoutMs);

    function onUp(id, info) {
      if (id !== tabId || info.status !== "complete") return;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(onUp);
      resolve();
    }

    chrome.tabs.onUpdated.addListener(onUp);
    chrome.tabs.get(tabId).then((tab) => {
      if (tab.status === "complete") {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(onUp);
        resolve();
      }
    });
  });
}

async function extractFromTab(tabId) {
  for (let i = 0; i < 18; i++) {
    try {
      const res = await chrome.tabs.sendMessage(tabId, { type: "ZUNI_EXTRACT" });
      if (
        res &&
        res.ok &&
        res.data &&
        res.data.price != null &&
        Number.isFinite(Number(res.data.price)) &&
        Number(res.data.price) > 0
      ) {
        const promoRaw = res.data.promoPrice;
        const promoPrice =
          promoRaw != null && Number.isFinite(Number(promoRaw)) ? Number(promoRaw) : null;
        return { price: Number(res.data.price), promoPrice };
      }
    } catch (e) {
      /* content script ainda não injetou */
    }
    await sleep(900);
  }
  return null;
}

async function postPrice(baseUrl, token, productId, price, promoPrice) {
  const url = `${normalizeBaseUrl(baseUrl)}/api/admin/import/mercadolivre/sync-product-prices`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      productId,
      price,
      promoPrice: promoPrice ?? null,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error || `HTTP ${res.status}`);
  }
  return json;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === "ZUNI_ML_SYNC_PING") {
    sendResponse({ ok: true, version: chrome.runtime.getManifest().version });
    return false;
  }

  if (msg && msg.type === "ZUNI_ML_SYNC_BATCH") {
    (async () => {
      const { baseUrl, token } = await chrome.storage.sync.get(["baseUrl", "token"]);
      const b = normalizeBaseUrl(baseUrl || "");
      const t = String(token || "").trim();
      if (!b || !t) {
        sendResponse({
          ok: false,
          error: "Configure a URL base e o token nas opções da extensão (ícone → Opções).",
        });
        return;
      }

      const items = Array.isArray(msg.items) ? msg.items : [];
      if (!items.length) {
        sendResponse({ ok: false, error: "Nenhum item na fila." });
        return;
      }

      const results = [];
      for (const it of items) {
        const openUrl = it.url;
        const id = it.id;
        if (!openUrl || !id) {
          results.push({ id: id || null, ok: false, error: "URL ou id ausente." });
          continue;
        }

        let tabId = null;
        try {
          const tab = await chrome.tabs.create({ url: openUrl, active: false });
          tabId = tab.id;
          await waitTabComplete(tabId, 90000);
          await sleep(3200);
          const extracted = await extractFromTab(tabId);
          if (!extracted) {
            results.push({ id, ok: false, error: "Não foi possível ler o preço (PDP ainda carregando ou layout diferente)." });
          } else {
            await postPrice(b, t, id, extracted.price, extracted.promoPrice);
            results.push({
              id,
              ok: true,
              price: extracted.price,
              promoPrice: extracted.promoPrice,
            });
          }
        } catch (e) {
          results.push({
            id,
            ok: false,
            error: e && e.message ? String(e.message) : String(e),
          });
        } finally {
          if (tabId != null) {
            try {
              await chrome.tabs.remove(tabId);
            } catch (e) {
              /* ignore */
            }
          }
        }
      }

      const okCount = results.filter((r) => r.ok).length;
      sendResponse({ ok: true, results, okCount, failCount: results.length - okCount });
    })();
    return true;
  }

  return false;
});
