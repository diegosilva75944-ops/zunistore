import { getContactSettings } from "@/lib/store";
import { ContactBlock } from "@/components/ContactBlock";

export const revalidate = 300;

export default async function ContatoPage() {
  const c = await getContactSettings();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Contato</h1>
        <p className="text-sm text-zinc-600">
          Fale com a equipe do ZuniStore.
        </p>
      </div>

      <div className="rounded-2xl bg-white ring-1 ring-zinc-200 p-6">
        <ContactBlock contact={c} />

        <div className="pt-3 text-xs text-zinc-500">
          Observação: o ZuniStore não realiza vendas diretamente. O botão Comprar abre a loja original em nova aba.
        </div>
      </div>
    </div>
  );
}
