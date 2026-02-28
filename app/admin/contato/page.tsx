import { ContactClient } from "@/app/admin/contato/contact-client";

export const runtime = "nodejs";
export const revalidate = 0;

export default function AdminContatoPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Contato</h1>
        <p className="text-sm text-zinc-600">
          Campos usados automaticamente no rodapé do site.
        </p>
      </div>
      <ContactClient />
    </div>
  );
}

