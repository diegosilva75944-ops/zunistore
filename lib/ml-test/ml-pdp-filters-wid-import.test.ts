import { describe, expect, it } from "vitest";
import { runTestMlImport } from "./pipeline";

const networkOk = process.env.CI !== "true" && process.env.SKIP_ML_NETWORK !== "1";

const URL =
  "https://www.mercadolivre.com.br/caixa-caixinha-de-som-potente-pc-notebook-subwoofer-para-computador-6w-usb-p2-coolmusic/p/MLB53988081?pdp_filters=item_id%3AMLB5677676192#polycard_client=affiliates&wid=MLB5677676192&sid=affiliates";

describe("runTestMlImport — pdp_filters + wid no hash", () => {
  it.skipIf(!networkOk)("importa dados (não em branco) incluindo preço", async () => {
    const r = await runTestMlImport(URL, "auto");
    expect(r.title?.trim().length).toBeGreaterThan(5);
    expect(r.images.length).toBeGreaterThan(0);
    expect(r.pricing.currentPrice).not.toBeNull();
    expect(r.pricing.currentPrice).toBeGreaterThan(0);
  });
});

