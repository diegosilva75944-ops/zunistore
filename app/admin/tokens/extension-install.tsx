"use client";

export function ExtensionInstall() {
  function openChromeExtensions() {
    window.open("chrome://extensions", "_blank", "noopener,noreferrer");
  }

  return (
    <div className="rounded-2xl bg-zinc-50 ring-1 ring-zinc-200 p-4 space-y-3">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold">Instalar extensão no navegador</h2>
          <p className="text-xs text-zinc-600 mt-0.5">
            A extensão ZuniStore Importer fica na pasta <code className="font-mono text-zinc-700">zunistore-importer</code> do projeto.
          </p>
        </div>
        <button
          type="button"
          onClick={openChromeExtensions}
          className="shrink-0 rounded-full bg-zuni-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-95 transition"
        >
          Abrir Chrome Extensions
        </button>
      </div>
      <ol className="text-sm text-zinc-700 space-y-1 list-decimal list-inside">
        <li>Clique em &quot;Abrir Chrome Extensions&quot; (ou acesse <code className="font-mono text-xs">chrome://extensions</code>)</li>
        <li>Ative o <strong>Modo desenvolvedor</strong> no canto superior direito</li>
        <li>Clique em <strong>Carregar sem compactação</strong></li>
        <li>Selecione a pasta <strong>zunistore-importer</strong> dentro do projeto</li>
      </ol>
    </div>
  );
}
