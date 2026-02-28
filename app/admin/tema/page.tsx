import { ThemeClient } from "@/app/admin/tema/theme-client";

export const runtime = "nodejs";
export const revalidate = 0;

export default function AdminTemaPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Tema</h1>
        <p className="text-sm text-zinc-600">
          Edite as CSS variables do tema e o logo (URL). As mudanças refletem no site.
        </p>
      </div>

      <ThemeClient />
    </div>
  );
}

