import type { TestMlImportResult } from "@/lib/ml-test/types";

/** Mesmo formato do teste ML + metadados Magalu (só memória / debug). */
export type TestMagaluImportResult = TestMlImportResult & {
  productIdFromUrl: string;
  /** Especificações (tabela «Informações do Produto») */
  specs: Record<string, string>;
};

export type MagaluImportMode = "auto" | "html" | "headless";
