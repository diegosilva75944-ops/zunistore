/**
 * Embaralha um array com ordem estável durante o dia civil em America/Sao_Paulo
 * e diferente a cada dia (renovação ~24h na virada do dia local).
 */

function brazilCalendarDayNumber(): number {
  const ymd = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  return parseInt(ymd.replace(/-/g, ""), 10);
}

function seededUnitRandom(seed: number, i: number): number {
  let x = Math.imul(seed ^ i, 0x9e3779b9);
  x ^= x >>> 16;
  x = Math.imul(x, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  return (x >>> 0) / 0xffffffff;
}

/** Cópia embaralhada (Fisher–Yates com seed diário). */
export function shuffleDailyOrder<T>(items: readonly T[]): T[] {
  const arr = [...items];
  const seed = brazilCalendarDayNumber();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(seededUnitRandom(seed, i * 7919 + i) * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
