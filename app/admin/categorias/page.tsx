import { CategoriesClient } from "./categories-client";

export const metadata = {
  title: "Categorias",
  description: "Cadastrar e editar categorias de produtos",
};

export default function AdminCategoriasPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Categorias</h1>
      <p className="text-sm text-zinc-600">
        Árvore hierárquica: crie subcategorias escolhendo o pai ou use «+ Sub». No site, o cabeçalho mostra ícones e, ao
        passar o mouse, as subcategorias reais de cada item.
      </p>
      <CategoriesClient />
    </div>
  );
}
