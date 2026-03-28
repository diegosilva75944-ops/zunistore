import { describe, expect, it } from "vitest";
import { parsePriceEmOutrosMeiosLine } from "./normalize";

describe("parsePriceEmOutrosMeiosLine", () => {
  it("extrai preço antes de ‘em outros meios’", () => {
    expect(parsePriceEmOutrosMeiosLine("ou R$150 em outros meios")).toBe(150);
    expect(parsePriceEmOutrosMeiosLine("Texto ou R$ 1.234,56 em outros meios de pagamento")).toBe(1234.56);
  });

  it("ignora parcela na mesma linha", () => {
    expect(parsePriceEmOutrosMeiosLine("12x R$ 50 em outros meios")).toBeNull();
    expect(parsePriceEmOutrosMeiosLine("4x de R$ 30 em outros meios")).toBeNull();
  });

  it("ignora linha típica de cartão", () => {
    expect(
      parsePriceEmOutrosMeiosLine("R$ 200 em outros meios no cartão de crédito"),
    ).toBeNull();
  });
});
