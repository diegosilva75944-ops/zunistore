import { ProductsTableClient } from "./products-table-client";

export default function AdminTabelaProdutosPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">Tabela de produtos</h1>
        <p className="text-sm text-zinc-600 mt-1">
          Todos os campos da tabela <code className="text-xs bg-zinc-100 px-1 rounded">products</code> (exceto
          colunas geradas). Atualização automática a cada 8s (aba visível); linhas em edição não são sobrescritas até
          Guardar ou Reverter.
        </p>
      </div>
      <ProductsTableClient />
    </div>
  );
}
