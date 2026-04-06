import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runTestMlImport } from "./pipeline";

const networkOk = process.env.CI !== "true" && process.env.SKIP_ML_NETWORK !== "1";

let prevUserDataDir: string | undefined;

beforeAll(() => {
  prevUserDataDir = process.env.ML_PLAYWRIGHT_USER_DATA_DIR;
  process.env.ML_PLAYWRIGHT_USER_DATA_DIR = mkdtempSync(join(tmpdir(), "zuni-ml-test-"));
});

afterAll(() => {
  if (prevUserDataDir !== undefined) process.env.ML_PLAYWRIGHT_USER_DATA_DIR = prevUserDataDir;
  else delete process.env.ML_PLAYWRIGHT_USER_DATA_DIR;
});

/** Link real: path /p/MLB32068338 (catálogo) + #wid=MLB4519212879 (anúncio em reco). */
const RECO_URL =
  "https://www.mercadolivre.com.br/cadeira-de-escritorio-begonia-tela-mesh-ergonomica-giratoria/p/MLB32068338#polycard_client=recommendations_vip&reco_backend=ranker_compl_marketplace&reco_model=rk_ctr_v1_retsys_comple_tpt&reco_client=vip&reco_item_pos=3&reco_backend_type=low_level&reco_id=35606a46-4324-40f3-80cc-113860363508&wid=MLB4519212879&sid=recos";

describe("runTestMlImport — URL reco wid ≠ MLB do path", () => {
  it.skipIf(!networkOk)("importa título e preço (não vazio)", async () => {
    const r = await runTestMlImport(RECO_URL, "auto", { playwrightHeaded: false });
    expect(r.title?.trim().length).toBeGreaterThan(5);
    expect(r.pricing.currentPrice).not.toBeNull();
    expect(r.pricing.currentPrice).toBeGreaterThan(0);
  }, 90_000);
});
