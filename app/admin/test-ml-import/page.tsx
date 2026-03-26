import { TestMlImportClient } from "@/components/admin/TestMlImportClient";

export const dynamic = "force-dynamic";

export default function AdminTestMlImportPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">Teste URL Mercado Livre</h1>
        <p className="text-sm text-zinc-600 mt-1 max-w-3xl">
          Ferramenta interna para testar extração de título, preços, imagens e descrição a partir de uma URL pública
          do Mercado Livre. Os resultados existem apenas na memória desta aba — não alteram o catálogo nem o banco de
          dados.
        </p>
      </div>
      <TestMlImportClient />
    </div>
  );
}
