import { TokensClient } from "@/app/admin/tokens/tokens-client";

export const runtime = "nodejs";
export const revalidate = 0;

export default function AdminTokensPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Tokens</h1>
        <p className="text-sm text-zinc-600">
          Tokens são usados exclusivamente pela Extensão Chrome para importar produtos.
        </p>
      </div>

      <TokensClient />
    </div>
  );
}

