import { MercadoLivreClient } from "./mercadolivre-client";

export const runtime = "nodejs";
export const revalidate = 0;

export default function AdminMercadoLivrePage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Importar do Mercado Livre</h1>
        <p className="text-sm text-zinc-600">
          Importação interna usando apenas dados públicos de anúncios públicos (sem OAuth e sem credenciais do Mercado Livre).
        </p>
      </div>
      <MercadoLivreClient />
    </div>
  );
}

