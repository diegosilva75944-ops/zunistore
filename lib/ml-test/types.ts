export type PriceConfidence = "high" | "medium" | "low";

export type PriceDataSource = "html" | "json_embedded" | "headless" | "mixed";

export type PricingDisplayMode = "single_price" | "discounted_price" | "unknown";

export type ChosenBlockInfo = {
  id: string;
  selector: string;
  reason: string;
  score: number;
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
  /** Metadados extras para decisão / debug */
  containerId?: string | null;
  containerPath?: string;
  isBestPriceLabel?: boolean;
  isOfficialStoreOffer?: boolean;
  isCrossSell?: boolean;
  isVisible?: boolean;
  isStriked?: boolean;
  isOtherSeller?: boolean;
  score?: number;
};

export type IgnoredCandidateEntry = {
  index: number;
  value: number;
  source: PriceCandidate["source"];
  reason: string;
};

export type UsedCandidateEntry = {
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
  usedCandidates: UsedCandidateEntry[];
  ignoredCandidates: IgnoredCandidateEntry[];
  discardReasons: string[];
};

export type TestMlImportResult = {
  title: string | null;
  shortDescription: string;
  fullDescription: string;
  images: string[];
  /** Nota média (0–5), ex.: JSON-LD aggregateRating ou DOM */
  rating: number | null;
  /** Quantidade de avaliações */
  reviewsCount: number | null;
  /** Breadcrumb de categoria na PDP (para mapear categories internas) */
  categoryPath: string[];
  categoryName: string;
  pricing: PricingPreview;
  debug: {
    candidates: PriceCandidate[];
    extractionSteps: string[];
    rawSignals: Record<string, unknown>;
    chosenBlock: ChosenBlockInfo | null;
    chosenSignals: Record<string, unknown>;
    usedCandidates: UsedCandidateEntry[];
    ignoredCandidates: IgnoredCandidateEntry[];
    /** Resumo legível de por que valores/blocos foram descartados para o preço final */
    discardReasons: string[];
  };
};

export type ExtractFromHtmlOutput = {
  title: string | null;
  fullDescription: string;
  shortDescription: string;
  images: string[];
  rating: number | null;
  reviewsCount: number | null;
  categoryPath: string[];
  categoryName: string;
  candidates: PriceCandidate[];
  extractionSteps: string[];
  rawSignals: Record<string, unknown>;
};

export type ImportMode = "auto" | "html" | "headless";
