"use client";

import { useCallback, useEffect, useState } from "react";
import type { Product } from "@/lib/store";
import { personalizationAllowed } from "@/lib/consent";
import { getSessionId } from "@/lib/session";
import { localGetRecentProducts } from "@/lib/tracking/local-storage";
import { PersonalizedProductsSection } from "@/components/home/PersonalizedProductsSection";
import { SearchBasedProductsSection } from "@/components/home/SearchBasedProductsSection";
import { RecentProductsSection } from "@/components/home/RecentProductsSection";
import { PopularProductsSection } from "@/components/home/PopularProductsSection";

function SkeletonBlock() {
  return (
    <section className="space-y-4" aria-busy="true" aria-label="Carregando vitrine personalizada">
      <div className="h-7 w-64 max-w-full animate-pulse rounded-lg bg-zinc-200" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
    const sid = getSessionId();
    const allow = personalizationAllowed();
    setAllowPersonal(allow);

    const popBase = "/api/recommendations/popular?limit=12";

    try {
      if (!allow || !sid) {
        const pop = await fetch(popBase).then((r) => r.json());
        setPersonalized([]);
        setSearchBased([]);
        setRecent([]);
        setPopular(Array.isArray(pop?.items) ? pop.items : []);
        return;
      }

      const pRes = await fetch(
        `/api/recommendations/personalized?sessionId=${encodeURIComponent(sid)}&limit=12`,
      );
      const pJson = await pRes.json();
      const pItems: Product[] = Array.isArray(pJson?.items) ? pJson.items : [];
      setPersonalized(pItems);

      const ex1 = pItems.map((x) => x.id);
      const sRes = await fetch(
        `/api/recommendations/search-based?sessionId=${encodeURIComponent(sid)}&limit=12&excludeIds=${encodeURIComponent(ex1.join(","))}`,
      );
      const sJson = await sRes.json();
      const sItems: Product[] = Array.isArray(sJson?.items) ? sJson.items : [];
      setSearchBased(sItems);

      const ex2 = new Set([...ex1, ...sItems.map((x) => x.id)]);
      const recentIds = localGetRecentProducts().map((r) => r.id);
      let rItems: Product[] = [];
      if (recentIds.length) {
        const rRes = await fetch(
          `/api/recommendations/recent?ids=${encodeURIComponent(recentIds.join(","))}&limit=12&excludeIds=${encodeURIComponent([...ex2].join(","))}`,
        );
        const rJson = await rRes.json();
        rItems = Array.isArray(rJson?.items) ? rJson.items : [];
      }
      setRecent(rItems);

      const ex3 = new Set([...ex2, ...rItems.map((x) => x.id)]);
      const pop2 = await fetch(
        `${popBase}&excludeIds=${encodeURIComponent([...ex3].join(","))}`,
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
    return (
      <div className="space-y-4">
        <PopularProductsSection
          products={popular}
          subtitle="Ranking geral da loja. Ative a personalização no aviso de cookies para recomendações sob medida."
          emptyMessage="Ainda não há dados de popularidade suficientes. Confira ofertas e novidades."
        />
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <PersonalizedProductsSection products={personalized} />
      <SearchBasedProductsSection products={searchBased} />
      <RecentProductsSection products={recent} />
      <PopularProductsSection products={popular} />
    </div>
  );
}
