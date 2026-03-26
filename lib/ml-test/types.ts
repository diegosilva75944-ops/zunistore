export type PriceConfidence = "high" | "medium" | "low";

export type PriceDataSource = "html" | "json_embedded" | "headless" | "mixed";

export type PricingDisplayMode = "single_price" | "discounted_price" | "unknown";

export type ChosenBlockInfo = {
  selector: string;
  snippet: string | null;
  hasStrikethroughPrevious: boolean;
  previousInBlockCount: number;
  currentInBlockCount: number;
  notes: string[];
};

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

export type IgnoredCandidateEntry = {
  index: number;
  value: number;
  source: PriceCandidate["source"];
  reason: string;
};

export type PricingPreview = {
  currentPrice: number | null;
  originalPrice: number | null;
  discountPercent: number | null;
  hasDiscount: boolean;
  displayMode: PricingDisplayMode;
  installmentPrice: number | null;
  installments: number | null;
  confidence: PriceConfidence;
  source: PriceDataSource;
};

export type ResolvePreviewPricingResult = {
  pricing: PricingPreview;
  chosenBlock: ChosenBlockInfo | null;
  chosenSignals: Record<string, unknown>;
  ignoredCandidates: IgnoredCandidateEntry[];
};

export type TestMlImportResult = {
  title: string | null;
  shortDescription: string;
  fullDescription: string;
  images: string[];
  pricing: PricingPreview;
  debug: {
    candidates: PriceCandidate[];
    extractionSteps: string[];
    rawSignals: Record<string, unknown>;
    chosenBlock: ChosenBlockInfo | null;
    chosenSignals: Record<string, unknown>;
    ignoredCandidates: IgnoredCandidateEntry[];
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
