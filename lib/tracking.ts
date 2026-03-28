/**
 * Tracking de vitrine — reexporta API pública pedida no projeto.
 * Implementação em submódulos (local-storage, client).
 */
export { getSessionId } from "@/lib/session";
export { getConsentimentoPersonalizacao, personalizationAllowed, setPersonalizationConsent } from "@/lib/consent";
export {
  registrarBusca,
  registrarCliqueProduto,
  registrarVisualizacaoProduto,
  registrarVisitaCategoria,
  registrarProdutoRecente,
  limparHistoricoPersonalizacao,
} from "@/lib/tracking/client";
