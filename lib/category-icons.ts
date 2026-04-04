/**
 * Ícone leve (emoji) por palavras-chave no nome/slug — sem dependências extras.
 */
export function categoryIconGlyph(name: string, slug: string): string {
  const s = `${String(slug)} ${String(name)}`.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const rules: [RegExp, string][] = [
    [/celular|smartphone|telefonia|iphone|android/, "📱"],
    [/informatic|comput|notebook|pc|hardware|monitor|perifer/, "💻"],
    [/game|jogos|console|playstation|xbox|nintendo/, "🎮"],
    [/tv|televis|audio|som|fone|headphone/, "📺"],
    [/eletro|geladeira|fogao|micro|aspirador/, "🔌"],
    [/casa|decor|moveis|mesa|cadeira|ilumin|cozinha/, "🏠"],
    [/moda|roupa|vestu|calcado|tenis|bolsa/, "👕"],
    [/beleza|perfume|maquiagem|skin|hair/, "✨"],
    [/esporte|fitness|academia|bicicleta|corrida/, "⚽"],
    [/livro|papelaria|escolar|arte/, "📚"],
    [/brinquedo|infantil|bebe|baby/, "🧸"],
    [/ferramenta|obra|constru|jardim/, "🔧"],
    [/auto|carro|moto|peca/, "🚗"],
    [/pet|animal|cachorro|gato|racao/, "🐾"],
    [/saude|farmacia|suplement/, "💊"],
    [/aliment|bebida|mercado|vinho|cafe/, "🛒"],
    [/camera|foto|drone/, "📷"],
    [/relogio|joia|acessorio/, "⌚"],
  ];
  for (const [re, icon] of rules) {
    if (re.test(s)) return icon;
  }
  return "📦";
}
