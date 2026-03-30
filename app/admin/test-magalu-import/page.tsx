import { TestMagaluImportClient } from "@/components/admin/TestMagaluImportClient";

export const dynamic = "force-dynamic";

export default function AdminTestMagaluImportPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">Teste URL Magazine Luiza / Magazine Você</h1>
        <p className="text-sm text-zinc-600 mt-1 max-w-3xl">
          Ferramenta interna para testar extração de título, preços, imagens, ficha técnica e descrição a partir de
          uma URL pública do Magazine Você (Magalu). Os resultados existem apenas na memória desta aba — não alteram
          o catálogo nem o banco de dados. Para gravar no catálogo, use a extensão Magalu com token ou uma integração
          futura equivalente à do Mercado Livre.
        </p>
      </div>
      <TestMagaluImportClient />
    </div>
  );
}
