import { SyncPricesClient } from "@/app/admin/sincronizacao-precos/sync-prices-client";

export const runtime = "nodejs";
export const revalidate = 0;

export default function AdminSyncMlPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Sincronização de preços (Mercado Livre)</h1>
        <p className="text-sm text-zinc-600">
          Listagem dos produtos ML, sync no servidor (HTML + Playwright) em lotes e opção de fila pela
          extensão.
        </p>
      </div>
      <SyncPricesClient />
    </div>
  );
}
