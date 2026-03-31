import { getOptionalEnv } from "@/lib/env";
import { AdminMercadoLivreCatalogImportForm } from "@/components/admin/AdminMercadoLivreCatalogImportForm";

export const runtime = "nodejs";
export const revalidate = 0;

export default function AdminImportacaoPage() {
  const env = getOptionalEnv();
  const baseUrl = env?.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Importação</h1>
        <p className="text-sm text-zinc-600 mt-1 max-w-3xl">
          Você pode importar produtos do Mercado Livre pelo painel abaixo (logado) ou pela extensão do navegador com token.
          O servidor usa o mesmo pipeline do teste admin: HTML, preço do buy box, descrição, galeria e avaliações quando
          disponíveis.
        </p>
      </div>

      <AdminMercadoLivreCatalogImportForm />

      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-zinc-800">Extensão (token)</h2>
        <p className="text-sm text-zinc-600">
          A extensão envia a URL do produto e o link de afiliado para a API pública; o token autentica a requisição.
        </p>
        <div className="rounded-2xl bg-zinc-50 ring-1 ring-zinc-200 p-4 space-y-2 text-sm">
          <div>
            <span className="font-semibold">Base URL:</span>{" "}
            <span className="font-mono">{baseUrl}</span>
          </div>
          <div>
            <span className="font-semibold">Endpoint:</span>{" "}
            <span className="font-mono">{baseUrl}/api/admin/import/mercadolivre</span>
          </div>
          <div className="text-xs text-zinc-600">
            Crie um token em <span className="font-semibold">Tokens</span> e configure na extensão. Corpo JSON:{" "}
            <span className="font-mono">sourceUrl</span>, <span className="font-mono">affiliateUrl</span>, opcional{" "}
            <span className="font-mono">affiliateCode</span>.
          </div>
        </div>
      </div>
    </div>
  );
}
