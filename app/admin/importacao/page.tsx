import { getOptionalEnv } from "@/lib/env";

export const runtime = "nodejs";
export const revalidate = 0;

export default function AdminImportacaoPage() {
  const env = getOptionalEnv();
  const baseUrl = env?.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Importação (somente extensão)</h1>
        <p className="text-sm text-zinc-600">
          A importação de produtos é exclusiva via Extensão Chrome (Manifest V3).
        </p>
      </div>

      <div className="rounded-2xl bg-zinc-50 ring-1 ring-zinc-200 p-4 space-y-2 text-sm">
        <div className="font-semibold">Configuração</div>
        <div>
          <span className="font-semibold">Base URL:</span>{" "}
          <span className="font-mono">{baseUrl}</span>
        </div>
        <div>
          <span className="font-semibold">Endpoint:</span>{" "}
          <span className="font-mono">
            {baseUrl}/api/admin/import/mercadolivre
          </span>
        </div>
        <div className="text-xs text-zinc-600">
          Você precisa criar um Token em <span className="font-semibold">Tokens</span> e colar na extensão.
        </div>
      </div>
    </div>
  );
}

