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
      return setStatus("A URL deve ser de uma página de produto do Mercado Livre (mercadolivre.com.br/…/p/…).", true);
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
      setStatus("Importando no servidor (mesmo modelo do teste admin)…");

      const payload = {
        sourceUrl: productUrl,
        affiliateUrl,
        affiliateCode: "ml_ext",
      };

      const result = await importProduct(baseUrl, token, payload);

      const productLink = baseUrl.replace(/\/+$/, "") + (result.productUrl || `/produto/${result.code6}`);
      setStatus(`Importado! Código: ${result.code6}. ${productLink}`);
    } catch (e) {
      setStatus(String(e?.message || e), true);
    } finally {
      $("importBtn").disabled = false;
    }
  });
}

main();
