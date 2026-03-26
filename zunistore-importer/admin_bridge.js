/**
 * Ponte entre a página admin do ZuniStore e o service worker.
 * A página envia window.postMessage({ source: 'zunistore-admin', ... }); este script reencaminha.
 */
window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  const d = event.data;
  if (!d || d.source !== "zunistore-admin") return;

  if (d.type === "ZUNI_ML_SYNC_PING") {
    chrome.runtime.sendMessage({ type: "ZUNI_ML_SYNC_PING" }, (res) => {
      const err = chrome.runtime.lastError;
      window.postMessage(
        {
          source: "zunistore-extension",
          type: "ZUNI_ML_SYNC_PING_REPLY",
          ok: !err && res && res.ok,
          version: res && res.version,
          error: err ? err.message : undefined,
        },
        "*",
      );
    });
    return;
  }

  if (d.type === "ZUNI_ML_SYNC_REQUEST") {
    chrome.runtime.sendMessage({ type: "ZUNI_ML_SYNC_BATCH", items: d.items || [] }, (res) => {
      const err = chrome.runtime.lastError;
      if (err) {
        window.postMessage(
          {
            source: "zunistore-extension",
            type: "ZUNI_ML_SYNC_RESPONSE",
            ok: false,
            error: err.message,
          },
          "*",
        );
        return;
      }
      window.postMessage(
        {
          source: "zunistore-extension",
          type: "ZUNI_ML_SYNC_RESPONSE",
          ...(res || { ok: false, error: "Resposta vazia da extensão." }),
        },
        "*",
      );
    });
  }
});
