const $ = (id) => document.getElementById(id);

function setStatus(text) {
  const el = $("status");
  el.style.display = "block";
  el.textContent = text;
}

async function load() {
  const { baseUrl, token } = await chrome.storage.sync.get(["baseUrl", "token"]);
  $("baseUrl").value = baseUrl || "";
  $("token").value = token || "";
}

async function save() {
  const baseUrl = $("baseUrl").value.trim();
  const token = $("token").value.trim();
  await chrome.storage.sync.set({ baseUrl, token });
  setStatus("Salvo.");
}

$("saveBtn").addEventListener("click", save);
load();

