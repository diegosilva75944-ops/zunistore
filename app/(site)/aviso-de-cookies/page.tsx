export const revalidate = 86400;

export default function CookiesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Aviso de Cookies</h1>
        <p className="text-sm text-zinc-600">
          Como usamos cookies e tecnologias similares.
        </p>
      </div>

      <div className="rounded-2xl bg-white ring-1 ring-zinc-200 p-6 space-y-4 text-sm text-zinc-700">
        <p>
          O ZuniStore pode utilizar cookies para manter preferências, melhorar a experiência,
          e medir performance do site.
        </p>
        <p>
          Cookies de terceiros podem ser utilizados por ferramentas de analytics/ads, se configuradas.
          Você pode controlar cookies nas configurações do seu navegador.
        </p>
        <p className="text-xs text-zinc-500">
          Este texto é um modelo inicial. Recomenda-se revisão jurídica antes de publicação em produção.
        </p>
      </div>
    </div>
  );
}

