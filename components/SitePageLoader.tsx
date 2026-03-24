"use client";

import dynamic from "next/dynamic";
import cartLoader from "@/lib/lottie/cart-loader.json";

const Lottie = dynamic(() => import("lottie-react"), { ssr: false });

export function SitePageLoader() {
  return (
    <div
      className="flex min-h-[50vh] w-full flex-col items-center justify-center gap-4 py-16"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="sr-only">Carregando…</span>
      <Lottie
        animationData={cartLoader}
        loop
        className="mx-auto h-40 w-40 max-w-[min(70vw,280px)] [&_svg]:!block"
      />
    </div>
  );
}
