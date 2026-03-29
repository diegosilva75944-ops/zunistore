"use client";

import { useCallback, useEffect, useState } from "react";
import type { Product } from "@/lib/store";
import { personalizationAllowed } from "@/lib/consent";
import { hasVisitSessionCookie } from "@/lib/session";
import { localGetRecentProducts } from "@/lib/tracking/local-storage";
import { PersonalizedProductsSection } from "@/components/home/PersonalizedProductsSection";
import { SearchBasedProductsSection } from "@/components/home/SearchBasedProductsSection";
import { RecentProductsSection } from "@/components/home/RecentProductsSection";
import { PopularProductsSection } from "@/components/home/PopularProductsSection";
import { PRODUCT_CARD_GRID_CLASS } from "@/lib/ui/product-grid";

const noStoreFetch: RequestInit = { cache: "no-store", credentials: "include" };

async function fetchRecentRail(excludeIds: string[]): Promise<Product[]> {
  const recentIds = localGetRecentProducts().map((r) => r.id);
  if (!recentIds.length) return [];
  const rRes = await fetch(
    `/api/recommendations/recent?ids=${encodeURIComponent(recentIds.join(","))}&limit=12&excludeIds=${encodeURIComponent(excludeIds.join(","))}`,
    noStoreFetch,
  );
  const rJson = await rRes.json();
  return Array.isArray(rJson?.items) ? rJson.items : [];
}

function SkeletonBlock() {
  return (
    <section
      className="zuni-site-section space-y-4"
      aria-busy="true"
      aria-label="Carregando vitrine personalizada"
    >
      <div className="h-7 w-64 max-w-full animate-pulse rounded-lg bg-zinc-200" />
      <div className={PRODUCT_CARD_GRID_CLASS}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-64 animate-pulse rounded-2xl bg-zinc-200" />
        ))}
      </div>
    </section>
  );
}

export function HomeRecommendationSections() {
  const [loading, setLoading] = useState(true);
  const [personalized, setPersonalized] = useState<Product[]>([]);
  const [searchBased, setSearchBased] = useState<Product[]>([]);
  const [recent, setRecent] = useState<Product[]>([]);
  const [popular, setPopular] = useState<Product[]>([]);
  const [allowPersonal, setAllowPersonal] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const allow = personalizationAllowed();
    setAllowPersonal(allow);

    const popBase = "/api/recommendations/popular?limit=12";

    try {
      if (allow && !hasVisitSessionCookie()) {
        await fetch("/api/personalization/bootstrap", noStoreFetch);
      }

      if (!allow) {
        const pop = await fetch(popBase, noStoreFetch).then((r) => r.json());
        const popItems: Product[] = Array.isArray(pop?.items) ? pop.items : [];
        const rItems = await fetchRecentRail([]);
        setPersonalized([]);
        setSearchBased([]);
        setRecent(rItems);
        setPopular(popItems);
        return;
      }

      const pRes = await fetch(`/api/recommendations/personalized?limit=12`, noStoreFetch);
      const pJson = await pRes.json();
      const pItems: Product[] = Array.isArray(pJson?.items) ? pJson.items : [];
      setPersonalized(pItems);

      const ex1 = pItems.map((x) => x.id);
      const sRes = await fetch(
        `/api/recommendations/search-based?limit=12&excludeIds=${encodeURIComponent(ex1.join(","))}`,
        noStoreFetch,
      );
      const sJson = await sRes.json();
      const sItems: Product[] = Array.isArray(sJson?.items) ? sJson.items : [];
      setSearchBased(sItems);

      const ex2 = new Set([...ex1, ...sItems.map((x) => x.id)]);
      const rItems = await fetchRecentRail([...ex2]);
      setRecent(rItems);

      const ex3 = new Set([...ex2, ...rItems.map((x) => x.id)]);
      const pop2 = await fetch(
        `${popBase}&excludeIds=${encodeURIComponent([...ex3].join(","))}`,
        noStoreFetch,
      ).then((r) => r.json());
      setPopular(Array.isArray(pop2?.items) ? pop2.items : []);
    } catch {
      setPopular([]);
      setPersonalized([]);
      setSearchBased([]);
      setRecent([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    function onConsent() {
      void load();
    }
    window.addEventListener("zuni-personalization-consent", onConsent);
    return () => window.removeEventListener("zuni-personalization-consent", onConsent);
  }, [load]);

  if (loading) {
    return <SkeletonBlock />;
  }

  if (!allowPersonal) {
    const hasAny = recent.length > 0 || popular.length > 0;
    if (!hasAny) return null;
    return (
      <div className="space-y-10">
        {recent.length > 0 ? <RecentProductsSection products={recent} /> : null}
        {popular.length > 0 ? (
          <PopularProductsSection
            products={popular}
            subtitle="Ranking geral da loja. Ative a personalização no aviso de cookies para recomendações sob medida."
          />
        ) : null}
      </div>
    );
  }

  const hasAnyPersonalized =
    personalized.length > 0 ||
    searchBased.length > 0 ||
    recent.length > 0 ||
    popular.length > 0;
  if (!hasAnyPersonalized) return null;

  return (
    <div className="space-y-10">
      {personalized.length > 0 ? <PersonalizedProductsSection products={personalized} /> : null}
      {searchBased.length > 0 ? <SearchBasedProductsSection products={searchBased} /> : null}
      {recent.length > 0 ? <RecentProductsSection products={recent} /> : null}
      {popular.length > 0 ? <PopularProductsSection products={popular} /> : null}
    </div>
  );
}
