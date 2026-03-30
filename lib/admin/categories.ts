import "server-only";

import { postgrestGet, postgrestPost, PostgrestError } from "@/lib/postgrest/server";
import { slugify } from "@/lib/slug";

function enc(v: string): string {
  return encodeURIComponent(v);
}

export async function adminUpsertCategoryFromBreadcrumb(
  categoryPath: string[],
  categoryName: string,
): Promise<string | undefined> {
  const seeds = await postgrestGet<any[]>("categories", {
    select: "id,name,slug",
    is_seed: "eq.true",
    parent_id: "is.null",
  });
  const seedList = Array.isArray(seeds) ? seeds : [];
  if (!seedList.length) return undefined;

  const path = (categoryPath ?? []).map((s) => String(s || "").trim()).filter(Boolean);
  const leaf = String(categoryName || "").trim();
  const full: string[] = [...path];
  if (leaf && (!full.length || normalize(full[full.length - 1] ?? "") !== normalize(leaf))) {
    full.push(leaf);
  }
  if (!full.length) return seedList[0].id;

  const chosenSeed = pickClosestSeed(seedList, full);
  let parentId = chosenSeed?.id ?? seedList[0].id;
  let parentSlug = String(chosenSeed?.slug ?? seedList[0].slug ?? "").trim() || slugify(seedList[0].name);

  let start = 0;
  if (chosenSeed && full[0] && normalize(full[0]) === normalize(chosenSeed.name)) {
    start = 1;
  }

  for (let i = start; i < full.length; i++) {
    const name = String(full[i] || "").trim();
    if (!name) continue;

    const baseSlug = slugify(`${parentSlug}-${slugify(name)}`);

    const sameParent = await postgrestGet<any[]>("categories", {
      select: "id,slug",
      parent_id: `eq.${parentId}`,
      slug: `eq.${enc(baseSlug)}`,
      limit: "1",
    });
    const sameHit = Array.isArray(sameParent) ? sameParent[0] : null;
    if (sameHit?.id) {
      parentId = sameHit.id;
      parentSlug = String(sameHit.slug || baseSlug);
      continue;
    }

    const slug = await allocateCategorySlugUnderParent(baseSlug, parentId);

    const existingBeforeInsert = await findCategoryByParentAndSlug(parentId, slug);
    if (existingBeforeInsert?.id) {
      parentId = existingBeforeInsert.id;
      parentSlug = String(existingBeforeInsert.slug || slug);
      continue;
    }

    let created: any[] | undefined;
    try {
      created = await postgrestPost<any[]>(
        "categories",
        {
          name,
          slug,
          parent_id: parentId,
          is_seed: false,
        },
        "service",
        { select: "id,slug", returning: true },
      );
    } catch (e) {
      if (e instanceof PostgrestError && e.status === 409) {
        const recovered = await findCategoryByParentAndSlug(parentId, slug);
        if (recovered?.id) {
          parentId = recovered.id;
          parentSlug = String(recovered.slug || slug);
          continue;
        }
      }
      throw e;
    }
    const row = Array.isArray(created) ? created[0] : null;
    if (!row?.id) return parentId;
    parentId = row.id;
    parentSlug = String(row.slug || slug);
  }

  return parentId;
}

async function findCategoryByParentAndSlug(parentId: string, slug: string): Promise<{ id: string; slug: string } | null> {
  const rows = await postgrestGet<any[]>("categories", {
    select: "id,slug",
    parent_id: `eq.${parentId}`,
    slug: `eq.${enc(slug)}`,
    limit: "1",
  });
  const row = Array.isArray(rows) ? rows[0] : null;
  return row?.id ? { id: String(row.id), slug: String(row.slug ?? slug) } : null;
}

/**
 * Garante slug único globalmente. Se o slug já existir em outro pai, tenta sufixos (-2, -3…).
 * Se já existir no mesmo pai, devolve o mesmo slug — o caller deve usar findCategoryByParentAndSlug
 * antes do INSERT (evita 23505 em categories_slug_key).
 */
async function allocateCategorySlugUnderParent(baseSlug: string, parentId: string): Promise<string> {
  let candidate = baseSlug;
  for (let n = 0; n < 50; n++) {
    const rows = await postgrestGet<any[]>("categories", {
      select: "id,parent_id",
      slug: `eq.${enc(candidate)}`,
      limit: "1",
    });
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) return candidate;
    if (String(row.parent_id) === String(parentId)) {
      return candidate;
    }
    candidate = `${baseSlug}-${n + 2}`;
  }
  return `${baseSlug}-${Date.now()}`;
}

function pickClosestSeed(seeds: { id: string; name: string; slug: string }[], crumbs: string[]) {
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
