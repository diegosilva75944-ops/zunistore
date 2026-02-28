import type { Metadata } from "next";

export function robotsForListing(total: number, min = 8): Metadata["robots"] {
  if (total >= min) return { index: true, follow: true };
  return { index: false, follow: true };
}

