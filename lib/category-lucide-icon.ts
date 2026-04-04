import type { LucideIcon } from "lucide-react";
import {
  Baby,
  BookOpen,
  Camera,
  Car,
  Dumbbell,
  Gamepad2,
  Headphones,
  HeartPulse,
  Home,
  Laptop,
  Package,
  PawPrint,
  Plug,
  Shirt,
  ShoppingBasket,
  Smartphone,
  Sparkles,
  Tv,
  Watch,
  Wrench,
} from "lucide-react";

type IconRule = [RegExp, LucideIcon];

const rules: IconRule[] = [
  [/celular|smartphone|telefonia|iphone|android/, Smartphone],
  [/informatic|comput|notebook|pc|hardware|monitor|perifer/, Laptop],
  [/game|jogos|console|playstation|xbox|nintendo/, Gamepad2],
  [/fone|headphone|headset/, Headphones],
  [/tv|televis|audio|som/, Tv],
  [/eletro|geladeira|fogao|micro|aspirador/, Plug],
  [/casa|decor|moveis|mesa|cadeira|ilumin|cozinha/, Home],
  [/moda|roupa|vestu|calcado|tenis|bolsa/, Shirt],
  [/beleza|perfume|maquiagem|skin|hair/, Sparkles],
  [/esporte|fitness|academia|bicicleta|corrida/, Dumbbell],
  [/livro|papelaria|escolar|arte/, BookOpen],
  [/brinquedo|infantil|bebe|baby/, Baby],
  [/ferramenta|obra|constru|jardim/, Wrench],
  [/auto|carro|moto|peca/, Car],
  [/pet|animal|cachorro|gato|racao/, PawPrint],
  [/saude|farmacia|suplement/, HeartPulse],
  [/aliment|bebida|mercado|vinho|cafe/, ShoppingBasket],
  [/camera|foto|drone/, Camera],
  [/relogio|joia|acessorio/, Watch],
];

/** Ícone outline fino por palavras-chave no nome/slug (mesma lógica dos emojis legados). */
export function getCategoryLucideIcon(name: string, slug: string): LucideIcon {
  const s = `${String(slug)} ${String(name)}`.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  for (const [re, Icon] of rules) {
    if (re.test(s)) return Icon;
  }
  return Package;
}
