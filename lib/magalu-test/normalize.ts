const MAGALU_HOSTS = /magazinevoce\.com\.br|magazineluiza\.com\.br/i;

export function isMagaluProductUrl(raw: string): boolean {
  try {
    const u = new URL(raw.trim());
    if (!/^https?:$/i.test(u.protocol)) return false;
    if (!MAGALU_HOSTS.test(u.hostname)) return false;
    return /\/p\/\d+/i.test(u.pathname);
  } catch {
    return false;
  }
}

/** Código numérico do path …/p/240466500/… */
export function extractMagaluProductIdFromUrl(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    const m = u.pathname.match(/\/p\/(\d+)/i);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}
