import { SyncPricesClient } from "@/app/admin/sincronizacao-precos/sync-prices-client";

export const runtime = "nodejs";
export const revalidate = 0;

export default function AdminSincronizacaoPrecosPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Sincronização de preços (Mercado Livre)</h1>
        <p className="text-sm text-zinc-600">
          Abra os PDPs no seu navegador em lote e use o sync no servidor para gravar preços no banco.
        </p>
      </div>
      <SyncPricesClient />
    </div>
  );
}
