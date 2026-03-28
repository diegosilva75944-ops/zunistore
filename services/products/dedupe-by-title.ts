import "server-only";

import { moveProductToDeletedHistoryAndDelete } from "@/lib/admin/db";
import { postgrestRpc } from "@/lib/postgrest/server";

/**
 * Remove produtos com `title_norm` repetido, mantendo um por grupo (vínculo ML > menor code6 > mais antigo).
 * Depende da migration `title_norm` + RPC no Postgres.
 */
export async function runDedupeProductsByDuplicateTitle(): Promise<{ removed: number; errors: string[] }> {
  const errors: string[] = [];
  let rows: unknown;
  try {
    rows = await postgrestRpc<unknown>("dedupe_product_ids_duplicate_title_norm");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/PGRST202|42883|42703|does not exist|title_norm/i.test(msg)) {
      return { removed: 0, errors: ["Dedup por título indisponível (aplique a migration title_norm)."] };
    }
    return { removed: 0, errors: [msg] };
  }

  const ids: string[] = [];
  if (Array.isArray(rows)) {
    for (const r of rows) {
      if (typeof r === "string") ids.push(r);
      else if (r && typeof r === "object" && typeof (r as { id: unknown }).id === "string") {
        ids.push((r as { id: string }).id);
      }
    }
  }

  const uniq = [...new Set(ids)];
  let removed = 0;
  for (const id of uniq) {
    try {
      await moveProductToDeletedHistoryAndDelete(id, "duplicate_title");
      removed += 1;
    } catch (e) {
      errors.push(`${id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { removed, errors };
}
