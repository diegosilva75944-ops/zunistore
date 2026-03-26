import "server-only";

import { postgrestGet, postgrestPost } from "@/lib/postgrest/server";
import { slugify } from "@/lib/slug";

export async function adminUpsertCategoryFromBreadcrumb(categoryPath: string[], categoryName: string): Promise<string | undefined> {
  const seeds = await postgrestGet<any[]>("categories", {
    select: "id,name,slug",
    is_seed: "eq.true",
    parent_id: "is.null",
  });
  const seedList = Array.isArray(seeds) ? seeds : [];
  const path = (categoryPath ?? []).map((s) => String(s || "").trim()).filter(Boolean);
  const last = String(categoryName || path[path.length - 1] || "").trim();

  const chosenSeed = pickClosestSeed(seedList, path.concat(last));
  const seedId = chosenSeed?.id ?? seedList[0]?.id;

  if (!last) return seedId;

  const sameAsSeed = chosenSeed && normalize(last) === normalize(chosenSeed.name);
  if (sameAsSeed) return seedId;

  const subSlug = slugify(last);
  const existing = await postgrestGet<any[]>("categories", {
    select: "id",
    slug: `eq.${encodeURIComponent(subSlug)}`,
    limit: "1",
  });
  if (Array.isArray(existing) && existing[0]?.id) return existing[0].id;

  const created = await postgrestPost<any[]>(
    "categories",
    { name: last, slug: subSlug, parent_id: seedId, is_seed: false },
    "service",
    { select: "id", returning: true },
  );
  const createdRow = Array.isArray(created) ? created[0] : null;
  return createdRow?.id ?? seedId;
}

function pickClosestSeed(seeds: { id: string; name: string }[], crumbs: string[]) {
  if (!seeds.length) return null;
  const hay = normalize(crumbs.join(" "));
  const hayTokens = new Set(hay.split(/\s+/).filter(Boolean));

  let best = seeds[0];
  let bestScore = -1;
  for (const s of seeds) {
    const needle = normalize(s.name);
    const tokens = needle.split(/\s+/).filter(Boolean);
    let score = 0;
    for (const t of tokens) if (hayTokens.has(t)) score += 1;
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }
  return bestScore >= 1 ? best : seeds[0];
}

function normalize(input: string) {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

