import { SocialLinksClient } from "@/app/admin/redes-sociais/social-links-client";

export const runtime = "nodejs";
export const revalidate = 0;

export default function AdminRedesSociaisPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Redes sociais</h1>
        <p className="text-sm text-zinc-600">
          Links exibidos automaticamente no rodapé.
        </p>
      </div>
      <SocialLinksClient />
    </div>
  );
}

