export const revalidate = 86400;

const ULTIMA_ATUALIZACAO = "27 de março de 2026";

export default function PoliticaPage() {
  return (
    <article className="space-y-8 max-w-3xl">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Política de Privacidade</h1>
        <p className="text-sm text-zinc-600">
          ZuniStore — transparência sobre dados pessoais e navegação, em linha com a LGPD (Lei nº 13.709/2018).
        </p>
        <p className="text-xs text-zinc-500">
          Última atualização: <time dateTime="2026-03-27">{ULTIMA_ATUALIZACAO}</time>
        </p>
      </header>

      <div className="rounded-2xl bg-white ring-1 ring-zinc-200 p-6 md:p-8 space-y-8 text-sm text-zinc-700 leading-relaxed">
        <section className="space-y-3" id="intro">
          <h2 className="text-base font-semibold text-zinc-900">1. Introdução</h2>
          <p>
            O ZuniStore é um site de vitrine e marketplace afiliado: não realizamos a venda direta dos produtos.
            Ao clicar em links de compra ou afiliados, você pode ser redirecionado para sites de parceiros
            (por exemplo, marketplaces e lojas originais). Esta política explica como tratamos dados no nosso site
            e quais são os seus direitos.
          </p>
        </section>

        <section className="space-y-3" id="dados-coletados">
          <h2 className="text-base font-semibold text-zinc-900">2. Quais dados são coletados</h2>
          <p>Podemos envolver, conforme o uso do site e as suas escolhas:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong className="font-medium text-zinc-800">Dados de navegação e interação no ZuniStore</strong>, como
              termos de busca, cliques em produtos, visualização de páginas de produto e visitas a categorias — quando
              você aceita a personalização da vitrine.
            </li>
            <li>
              <strong className="font-medium text-zinc-800">Identificador de sessão anônimo</strong> (armazenado no seu
              navegador) para associar eventos à mesma visita/dispositivo, sem login de cliente.
            </li>
            <li>
              <strong className="font-medium text-zinc-800">Dados enviados por você em formulários</strong> (por exemplo,
              contato), quando existirem.
            </li>
            <li>
              <strong className="font-medium text-zinc-800">Dados técnicos comuns à web</strong>, como endereço IP,
              tipo de navegador, data/hora de acesso e páginas visitadas, inclusive quando usamos ferramentas de
              estatísticas (ex.: Google Analytics), conforme configuração do site.
            </li>
          </ul>
        </section>

        <section className="space-y-3" id="navegacao">
          <h2 className="text-base font-semibold text-zinc-900">3. Dados de navegação e interação</h2>
          <p>
            Se você <strong className="font-medium text-zinc-800">aceitar a personalização</strong>, registramos
            eventos como buscas realizadas, cliques em produtos, visualizações de páginas de produto e visitas a
            categorias, com proteções contra repetição excessiva (por exemplo, ignorar eventos idênticos em sequência
            muito rápida, quando aplicável).
          </p>
          <p>
            <strong className="font-medium text-zinc-800">Produtos recomendados podem ser exibidos com base em buscas,
            páginas visitadas e interações realizadas dentro do site.</strong> Também utilizamos ranking geral de
            popularidade (agregado) para sugerir itens em destaque para todos os visitantes.
          </p>
        </section>

        <section className="space-y-3" id="cookies">
          <h2 className="text-base font-semibold text-zinc-900">4. Cookies e armazenamento local</h2>
          <p>
            Utilizamos cookies e tecnologias similares (incluindo <code className="text-xs bg-zinc-100 px-1 rounded">localStorage</code>)
            para lembrar preferências, consentimento e, se aceito, o histórico de personalização neste dispositivo.
            Você pode gerenciar ou apagar cookies nas configurações do seu navegador; isso pode afetar algumas
            funcionalidades.
          </p>
        </section>

        <section className="space-y-3" id="finalidade">
          <h2 className="text-base font-semibold text-zinc-900">5. Finalidade da coleta</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Exibir e melhorar o catálogo, buscas e navegação.</li>
            <li>Personalizar a vitrine quando houver consentimento.</li>
            <li>Medir audiência e desempenho do site de forma agregada.</li>
            <li>Cumprir obrigações legais e reforçar segurança.</li>
          </ul>
        </section>

        <section className="space-y-3" id="personalizacao">
          <h2 className="text-base font-semibold text-zinc-900">6. Como funciona a personalização</h2>
          <p>
            Com base nos seus eventos no site (pesos relativos a busca, clique, visita à categoria e visualização de
            produto), calculamos sugestões e ordenamos candidatos do catálogo real, considerando também popularidade
            agregada. Se não houver histórico suficiente, usamos fallbacks (por exemplo, produtos recentes ou populares).
          </p>
        </section>

        <section className="space-y-3" id="recusar">
          <h2 className="text-base font-semibold text-zinc-900">7. Recusar a personalização</h2>
          <p>
            Você pode <strong className="font-medium text-zinc-800">recusar</strong> no banner de cookies/personalização.
            Nesse caso, não registramos histórico personalizado neste dispositivo (e removemos dados de personalização
            já armazenados aqui, quando aplicável) e priorizamos conteúdo geral, como ranking popular. O uso básico do site
            permanece disponível.
          </p>
        </section>

        <section className="space-y-3" id="limpar">
          <h2 className="text-base font-semibold text-zinc-900">8. Limpar histórico neste dispositivo</h2>
          <p>
            No rodapé do site há a opção para <strong className="font-medium text-zinc-800">limpar recomendações e
            histórico deste dispositivo</strong>, apagando entradas correspondentes no armazenamento local e solicitando
            a remoção dos eventos associados à sua sessão no servidor, quando existirem.
          </p>
        </section>

        <section className="space-y-3" id="compartilhamento">
          <h2 className="text-base font-semibold text-zinc-900">9. Compartilhamento de dados</h2>
          <p>
            Podemos compartilhar dados com provedores de hospedagem, analytics e infraestrutura estritamente necessários
            à operação do site. Ao clicar em links de afiliados ou &quot;Comprar&quot;, você é encaminhado ao site do
            parceiro, que possui política própria. Não vendemos seus dados pessoais.
          </p>
        </section>

        <section className="space-y-3" id="retencao">
          <h2 className="text-base font-semibold text-zinc-900">10. Armazenamento e retenção</h2>
          <p>
            Eventos de personalização no servidor são mantidos pelo tempo necessário às finalidades descritas e à
            melhoria do serviço, respeitando prazos legais. Agregações de popularidade podem ser conservadas em formato
            diário. Você pode solicitar esclarecimentos ou exercer direitos conforme a seção abaixo.
          </p>
        </section>

        <section className="space-y-3" id="seguranca">
          <h2 className="text-base font-semibold text-zinc-900">11. Segurança</h2>
          <p>
            Adotamos medidas técnicas e organizacionais razoáveis para proteger dados contra acessos não autorizados,
            vazamentos e usos indevidos. Nenhum sistema é 100% seguro; em caso de incidente relevante, buscaremos agir
            conforme a lei.
          </p>
        </section>

        <section className="space-y-3" id="direitos">
          <h2 className="text-base font-semibold text-zinc-900">12. Direitos do titular (LGPD)</h2>
          <p>Você pode solicitar, conforme a legislação:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Confirmação de tratamento e acesso aos dados;</li>
            <li>Correção de dados incompletos ou desatualizados;</li>
            <li>Anonimização, bloqueio ou eliminação de dados desnecessários;</li>
            <li>Informação sobre compartilhamentos;</li>
            <li>Revogação do consentimento, quando o tratamento se basear nele.</li>
          </ul>
          <p>
            Para exercer direitos, utilize o canal de contato indicado abaixo. Podemos pedir informações mínimas para
            confirmar sua identidade.
          </p>
        </section>

        <section className="space-y-3" id="afiliados">
          <h2 className="text-base font-semibold text-zinc-900">13. Links de afiliados e parceiros</h2>
          <p>
            O ZuniStore pode receber remuneração quando você compra em sites parceiros após clicar em links de afiliado.
            Esses links podem incluir parâmetros de rastreamento definidos pelo parceiro. Recomendamos ler as políticas
            de privacidade e os termos do site para onde você é redirecionado.
          </p>
        </section>

        <section className="space-y-3" id="alteracoes">
          <h2 className="text-base font-semibold text-zinc-900">14. Alterações desta política</h2>
          <p>
            Podemos atualizar este texto para refletir mudanças no site ou na legislação. A data no topo indica a última
            revisão relevante. O uso continuado do site após alterações pode significar que você tomou ciência das
            mudanças, conforme aplicável.
          </p>
        </section>

        <section className="space-y-3" id="contato">
          <h2 className="text-base font-semibold text-zinc-900">15. Contato</h2>
          <p>
            Em caso de dúvidas sobre privacidade ou para exercer seus direitos, entre em contato pelos canais indicados
            na página <a href="/contato" className="text-zuni-primary font-semibold hover:underline">Contato</a> do
            ZuniStore.
          </p>
        </section>

        <p className="text-xs text-zinc-500 pt-4 border-t border-zinc-100">
          Este texto tem caráter informativo. Recomenda-se revisão por profissional jurídico antes de publicação
          definitiva em produção, conforme o seu caso concreto e integrações de terceiros.
        </p>
      </div>
    </article>
  );
}
