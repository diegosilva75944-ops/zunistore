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
        Categorias aparecem no menu do site. Categorias de seed vêm do banco; você pode criar novas aqui.
      </p>
      <CategoriesClient />
    </div>
  );
}
