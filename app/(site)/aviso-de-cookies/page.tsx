import Link from "next/link";

export const revalidate = 86400;

const ULTIMA_ATUALIZACAO = "27 de março de 2026";

export default function CookiesPage() {
  return (
    <article className="space-y-6">
      <header className="zuni-site-section space-y-2">
        <h1 className="text-2xl font-semibold">Aviso de Cookies e Personalização</h1>
        <p className="text-sm text-zinc-600">
          Como o ZuniStore usa cookies, armazenamento local e dados de interação — alinhado ao banner do site e à{" "}
          <Link href="/politica-de-privacidade" className="text-zuni-primary font-semibold hover:underline">
            Política de Privacidade
          </Link>
          .
        </p>
        <p className="text-xs text-zinc-500">
          Última atualização: <time dateTime="2026-03-27">{ULTIMA_ATUALIZACAO}</time>
        </p>
      </header>

      <div className="space-y-6 text-sm text-zinc-700 leading-relaxed">
        <section className="zuni-site-section space-y-2">
          <h2 className="text-base font-semibold text-zinc-900">O que utilizamos</h2>
          <p>
            Utilizamos <strong className="font-medium text-zinc-800">cookies</strong>,{" "}
            <code className="text-xs bg-zinc-100 px-1 rounded">localStorage</code> e, com o seu consentimento no
            banner, registro de <strong className="font-medium text-zinc-800">interações</strong> (buscas, cliques em
            produtos, páginas de produto e visitas a categorias) para personalizar a vitrine neste dispositivo e, quando
            aplicável, sincronizar eventos com o servidor.
          </p>
        </section>

        <section className="zuni-site-section space-y-2">
          <h2 className="text-base font-semibold text-zinc-900">Personalização</h2>
          <p>
            Se você <strong className="font-medium text-zinc-800">aceitar</strong>, podemos usar esse histórico para
            exibir seções como “Mais procurados para você”, “Baseado nas suas buscas” e “Você viu recentemente”.
            <strong className="font-medium text-zinc-800">
              {" "}
              Produtos recomendados podem ser exibidos com base em buscas, páginas visitadas e interações realizadas
              dentro do site.
            </strong>
          </p>
          <p>
            Se você <strong className="font-medium text-zinc-800">recusar</strong>, não registramos esse histórico de
            personalização, removemos os dados correspondentes neste dispositivo e priorizamos conteúdo geral (por
            exemplo, ranking popular). O uso básico do site permanece disponível.
          </p>
        </section>

        <section className="zuni-site-section space-y-2">
          <h2 className="text-base font-semibold text-zinc-900">Analytics e terceiros</h2>
          <p>
            Podemos usar ferramentas de estatísticas (como Google Analytics) que definem os próprios cookies, conforme a
            configuração do site. Você pode gerenciar ou bloquear cookies nas configurações do navegador; isso pode
            alterar algumas funcionalidades.
          </p>
        </section>

        <section className="zuni-site-section space-y-2">
          <h2 className="text-base font-semibold text-zinc-900">Alterar ou limpar</h2>
          <p>
            Você pode mudar de ideia quando o banner for exibido novamente (por exemplo, após limpar dados do site) ou
            usar a opção no rodapé para{" "}
            <strong className="font-medium text-zinc-800">limpar recomendações e histórico deste dispositivo</strong>.
            Detalhes sobre direitos e contato estão na{" "}
            <Link href="/politica-de-privacidade" className="text-zuni-primary font-semibold hover:underline">
              Política de Privacidade
            </Link>
            .
          </p>
        </section>

        <section className="zuni-site-section">
          <p className="text-xs text-zinc-500">
            Texto informativo. Recomenda-se revisão jurídica antes de publicação definitiva em produção.
          </p>
        </section>
      </div>
    </article>
  );
}
