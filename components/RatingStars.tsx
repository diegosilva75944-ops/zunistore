/**
 * Estrelas proporcionais à nota (0–5), na cor da marca (zuni-yellow, igual ao “Store” da logo).
 */
export function RatingStars({
  rating,
  className = "",
  starClassName = "text-[0.85rem]",
}: {
  rating: number | null | undefined;
  className?: string;
  /** Tamanho da estrela (1em = largura de cada ★) */
  starClassName?: string;
}) {
  if (rating == null || !Number.isFinite(Number(rating))) return null;
  const r = Math.min(5, Math.max(0, Number(rating)));
  const label = `Nota ${r.toFixed(1).replace(".", ",")} de 5 estrelas`;

  return (
    <span
      className={`inline-flex items-center gap-px ${className}`}
      role="img"
      aria-label={label}
    >
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = Math.min(1, Math.max(0, r - (i - 1)));
        return (
          <span
            key={i}
            className={`relative inline-grid shrink-0 place-items-start leading-none ${starClassName}`}
            style={{ width: "1em", height: "1em" }}
          >
            <span className="col-start-1 row-start-1 text-zinc-300 select-none" aria-hidden>
              ★
            </span>
            <span
              className="col-start-1 row-start-1 overflow-hidden text-zuni-yellow"
              style={{ width: `${fill * 100}%` }}
              aria-hidden
            >
              <span className="block select-none" style={{ width: "1em" }}>
                ★
              </span>
            </span>
          </span>
        );
      })}
    </span>
  );
}
