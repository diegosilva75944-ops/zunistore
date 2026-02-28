export const revalidate = 86400;

export default function PoliticaPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Política de Privacidade</h1>
        <p className="text-sm text-zinc-600">
          Transparência sobre como tratamos dados no ZuniStore.
        </p>
      </div>

      <div className="rounded-2xl bg-white ring-1 ring-zinc-200 p-6 space-y-4 text-sm text-zinc-700">
        <p>
          O ZuniStore é um marketplace afiliado. Não realizamos a venda diretamente.
          Ao clicar em Comprar, você será redirecionado para o site do vendedor/marketplace original em nova aba.
        </p>
        <p>
          Podemos coletar dados técnicos de navegação (como páginas acessadas e identificadores de dispositivo)
          para fins de segurança, melhoria de performance e estatísticas agregadas.
        </p>
        <p>
          Se houver integração com ferramentas de analytics/ads, elas poderão usar cookies para medir desempenho.
        </p>
        <p className="text-xs text-zinc-500">
          Este texto é um modelo inicial. Recomenda-se revisão jurídica antes de publicação em produção.
        </p>
      </div>
    </div>
  );
}

