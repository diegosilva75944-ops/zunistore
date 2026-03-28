/** Normalização alinhada ao cliente (tracking). */
export function normalizeSearchTermServer(raw: string): string {
  return String(raw || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .slice(0, 200);
}
