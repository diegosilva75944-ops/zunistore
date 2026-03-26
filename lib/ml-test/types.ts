export type PriceConfidence = "high" | "medium" | "low";

export type PriceDataSource = "html" | "json_embedded" | "headless" | "mixed";

export type PriceCandidate = {
  value: number;
  rawText: string;
  nearText: string;
  source: "json_ld" | "meta" | "hydration" | "andes_dom" | "regex" | "aria";
  fromMainBlock: boolean;
  isInstallment: boolean;
  isShipping: boolean;
  isRecommendation: boolean;
  isOriginalCandidate: boolean;
  isCurrentCandidate: boolean;
};

export type TestMlImportResult = {
  title: string | null;
  shortDescription: string;
  fullDescription: string;
  images: string[];
  pricing: {
    currentPrice: number | null;
    originalPrice: number | null;
    discountPercent: number | null;
    installmentPrice: number | null;
    installments: number | null;
    confidence: PriceConfidence;
    source: PriceDataSource;
  };
  debug: {
    candidates: PriceCandidate[];
    extractionSteps: string[];
    rawSignals: Record<string, unknown>;
  };
};

export type ExtractFromHtmlOutput = {
  title: string | null;
  fullDescription: string;
  shortDescription: string;
  images: string[];
  candidates: PriceCandidate[];
  extractionSteps: string[];
  rawSignals: Record<string, unknown>;
};

export type ImportMode = "auto" | "html" | "headless";
