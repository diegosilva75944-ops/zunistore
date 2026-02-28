import { SeoClient } from "@/app/admin/seo/seo-client";

export const runtime = "nodejs";
export const revalidate = 0;

export default function AdminSeoPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">SEO Programático</h1>
        <p className="text-sm text-zinc-600">
          Gerencie `seo_queries` e controle indexação de páginas `/buscar/[slug]`.
        </p>
      </div>
      <SeoClient />
    </div>
  );
}

