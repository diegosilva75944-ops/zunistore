"use client";

import Image from "next/image";
import { useState, useRef, useCallback, useEffect } from "react";

type ProductGalleryProps = {
  images: string[];
  title: string;
};

const lightboxControlBtn =
  "inline-flex items-center justify-center rounded-full bg-white/55 backdrop-blur-md text-zinc-800 shadow-lg ring-1 ring-white/45 hover:bg-white/70 transition-colors min-h-11 min-w-11 shrink-0";

const MD_BREAKPOINT = 768;

function touchDistance(a: { clientX: number; clientY: number }, b: { clientX: number; clientY: number }) {
  const dx = a.clientX - b.clientX;
  const dy = a.clientY - b.clientY;
  return Math.hypot(dx, dy);
}

export function ProductGallery({ images, title }: ProductGalleryProps) {
  const [selected, setSelected] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lens, setLens] = useState({ show: false, x: 0, y: 0 });
  const [isMobileLightbox, setIsMobileLightbox] = useState(false);
  /** Zoom/pan só no mobile dentro da lightbox */
  const [lbScale, setLbScale] = useState(1);
  const [lbPan, setLbPan] = useState({ x: 0, y: 0 });

  const containerRef = useRef<HTMLDivElement>(null);
  const zoomAreaRef = useRef<HTMLDivElement>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const pinchRef = useRef<{ startDist: number; startScale: number } | null>(null);
  const panRef = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);
  const hadTwoFingersRef = useRef(false);
  const lbScaleRef = useRef(1);

  lbScaleRef.current = lbScale;

  const imgs = images?.length ? images : [null];
  const mainSrc = imgs[selected] ?? imgs[0];
  const validCount = imgs.filter(Boolean).length;
  const hasMultiple = validCount > 1;

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MD_BREAKPOINT - 1}px)`);
    const sync = () => setIsMobileLightbox(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!lightboxOpen) {
      setLbScale(1);
      setLbPan({ x: 0, y: 0 });
    }
  }, [lightboxOpen]);

  useEffect(() => {
    if (lightboxOpen) {
      setLbScale(1);
      setLbPan({ x: 0, y: 0 });
    }
  }, [selected, lightboxOpen]);

  /** touchmove não-passivo: evita scroll da página durante pinça/pan no zoom */
  useEffect(() => {
    if (!lightboxOpen || !isMobileLightbox) return;
    const el = zoomAreaRef.current;
    if (!el) return;
    const onMove = (e: TouchEvent) => {
      const n = e.touches.length;
      if (n === 2) {
        e.preventDefault();
        return;
      }
      if (n === 1 && lbScaleRef.current > 1) {
        e.preventDefault();
      }
    };
    el.addEventListener("touchmove", onMove, { passive: false });
    return () => el.removeEventListener("touchmove", onMove);
  }, [lightboxOpen, isMobileLightbox]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!containerRef.current || !mainSrc) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      setLens({ show: true, x, y });
    },
    [mainSrc],
  );

  const handleMouseLeave = useCallback(() => {
    setLens((l) => ({ ...l, show: false }));
  }, []);

  const handleClickMain = useCallback(() => {
    if (!mainSrc) return;
    setLightboxOpen(true);
  }, [mainSrc]);

  useEffect(() => {
    if (!lightboxOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [lightboxOpen]);

  const goPrev = useCallback(() => {
    const len = imgs.length;
    if (len <= 1) return;
    let i = selected;
    for (let step = 0; step < len; step++) {
      i = (i - 1 + len) % len;
      if (imgs[i]) {
        setSelected(i);
        return;
      }
    }
  }, [imgs, selected]);

  const goNext = useCallback(() => {
    const len = imgs.length;
    if (len <= 1) return;
    let i = selected;
    for (let step = 0; step < len; step++) {
      i = (i + 1) % len;
      if (imgs[i]) {
        setSelected(i);
        return;
      }
    }
  }, [imgs, selected]);

  useEffect(() => {
    if (!lightboxOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setLightboxOpen(false);
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxOpen, goPrev, goNext]);

  const onZoomAreaTouchStart = useCallback(
    (e: React.TouchEvent) => {
      const n = e.touches.length;
      if (n === 2 && isMobileLightbox) {
        hadTwoFingersRef.current = true;
        pinchRef.current = {
          startDist: touchDistance(e.touches[0], e.touches[1]),
          startScale: lbScaleRef.current,
        };
        touchStartRef.current = null;
        panRef.current = null;
        return;
      }
      if (n === 1) {
        if (isMobileLightbox && lbScaleRef.current > 1) {
          const t = e.touches[0];
          panRef.current = {
            startX: t.clientX,
            startY: t.clientY,
            origX: lbPan.x,
            origY: lbPan.y,
          };
          touchStartRef.current = null;
          return;
        }
        if (hasMultiple && !isMobileLightbox) {
          touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }
        if (hasMultiple && isMobileLightbox && lbScaleRef.current <= 1) {
          touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }
      }
    },
    [isMobileLightbox, hasMultiple, lbPan.x, lbPan.y],
  );

  const onZoomAreaTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!isMobileLightbox) return;
      if (e.touches.length === 2 && pinchRef.current) {
        const d = touchDistance(e.touches[0], e.touches[1]);
        const ratio = d / pinchRef.current.startDist;
        const next = Math.min(4, Math.max(1, pinchRef.current.startScale * ratio));
        setLbScale(next);
        return;
      }
      if (e.touches.length === 1 && panRef.current && lbScaleRef.current > 1) {
        const t = e.touches[0];
        setLbPan({
          x: panRef.current.origX + (t.clientX - panRef.current.startX),
          y: panRef.current.origY + (t.clientY - panRef.current.startY),
        });
      }
    },
    [isMobileLightbox],
  );

  const onZoomAreaTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!isMobileLightbox) {
        if (!hasMultiple || !touchStartRef.current) return;
        const t = e.changedTouches[0];
        const dx = t.clientX - touchStartRef.current.x;
        const dy = t.clientY - touchStartRef.current.y;
        touchStartRef.current = null;
        const minSwipe = 48;
        if (Math.abs(dx) < minSwipe) return;
        if (Math.abs(dx) < Math.abs(dy) * 1.2) return;
        if (dx > 0) goPrev();
        else goNext();
        return;
      }

      if (e.touches.length < 2) {
        pinchRef.current = null;
      }
      if (e.touches.length === 0) {
        panRef.current = null;
      }

      if (e.touches.length > 0) return;

      const pinchOrPan = hadTwoFingersRef.current || lbScaleRef.current > 1;
      if (hadTwoFingersRef.current) {
        hadTwoFingersRef.current = false;
      }

      if (pinchOrPan && lbScaleRef.current > 1) {
        touchStartRef.current = null;
        return;
      }

      if (!hasMultiple || !touchStartRef.current) {
        touchStartRef.current = null;
        return;
      }
      if (lbScaleRef.current > 1) {
        touchStartRef.current = null;
        return;
      }

      const t = e.changedTouches[0];
      const dx = t.clientX - touchStartRef.current.x;
      const dy = t.clientY - touchStartRef.current.y;
      touchStartRef.current = null;
      const minSwipe = 48;
      if (Math.abs(dx) < minSwipe) return;
      if (Math.abs(dx) < Math.abs(dy) * 1.2) return;
      if (dx > 0) goPrev();
      else goNext();
    },
    [isMobileLightbox, hasMultiple, goPrev, goNext],
  );

  const validIndex = (() => {
    let n = 0;
    for (let i = 0; i <= selected; i++) {
      if (imgs[i]) n += 1;
    }
    return n;
  })();

  const imageTransform =
    isMobileLightbox && lightboxOpen ?
      {
        transform: `translate(${lbPan.x}px, ${lbPan.y}px) scale(${lbScale})`,
        transformOrigin: "center center" as const,
      }
    : undefined;

  return (
    <div className="space-y-3">
      <div
        ref={containerRef}
        className="relative aspect-square rounded-2xl bg-white ring-1 ring-zinc-200 overflow-hidden cursor-zoom-in"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleClickMain}
      >
        {mainSrc ? (
          <>
            <Image
              src={mainSrc}
              alt={title}
              fill
              className="object-contain p-4"
              sizes="(max-width: 768px) 100vw, 50vw"
              priority
            />
            {lens.show && (
              <div
                className="absolute w-32 h-32 pointer-events-none hidden md:block rounded-full border-2 border-white shadow-xl"
                style={{
                  left: `${lens.x}%`,
                  top: `${lens.y}%`,
                  transform: "translate(-50%, -50%)",
                  background: `url(${mainSrc}) no-repeat`,
                  backgroundSize: "260% 260%",
                  backgroundPosition: `${lens.x}% ${lens.y}%`,
                }}
              />
            )}
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-zinc-500">
            Sem imagem
          </div>
        )}
      </div>

      {imgs.length > 1 && (
        <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
          {imgs.slice(0, 6).map((src, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setSelected(i)}
              className={`relative aspect-square rounded-xl bg-zinc-100 ring-2 overflow-hidden transition ${
                selected === i
                  ? "ring-zuni-primary ring-offset-2"
                  : "ring-transparent hover:ring-zinc-300"
              }`}
            >
              {src ? (
                <Image
                  src={src}
                  alt={`${title} - imagem ${i + 1}`}
                  fill
                  className="object-contain p-2"
                  sizes="80px"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-xs text-zinc-500">
                  —
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {lightboxOpen && mainSrc ? (
        <div
          className="fixed inset-0 z-[100] flex flex-col bg-black/90"
          style={{
            paddingTop: "max(0.75rem, env(safe-area-inset-top, 0px))",
            paddingBottom: "max(0.75rem, env(safe-area-inset-bottom, 0px))",
            paddingLeft: "max(0.75rem, env(safe-area-inset-left, 0px))",
            paddingRight: "max(0.75rem, env(safe-area-inset-right, 0px))",
          }}
          role="dialog"
          aria-modal="true"
          aria-label={`${title} — imagem em tamanho grande`}
        >
          <div className="flex shrink-0 justify-end pb-2">
            <button
              type="button"
              onClick={() => setLightboxOpen(false)}
              className={`h-11 w-11 ${lightboxControlBtn} text-2xl font-light leading-none`}
              aria-label="Fechar"
            >
              ×
            </button>
          </div>

          <div
            className="relative min-h-0 flex-1 w-full"
            style={
              isMobileLightbox ?
                { touchAction: lbScale > 1 ? "none" : "pan-y" }
              : hasMultiple ?
                { touchAction: "none" }
              : undefined
            }
            onClick={() => setLightboxOpen(false)}
          >
            <div
              ref={zoomAreaRef}
              className="absolute inset-0 overflow-hidden md:relative md:overflow-visible md:inset-auto md:mx-auto md:h-full md:w-full md:max-h-full md:max-w-full"
              onTouchStart={onZoomAreaTouchStart}
              onTouchMove={onZoomAreaTouchMove}
              onTouchEnd={onZoomAreaTouchEnd}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="relative h-full w-full md:mx-auto md:h-full md:w-full md:max-h-full md:max-w-full"
                style={imageTransform}
              >
                <Image
                  src={mainSrc}
                  alt={title}
                  fill
                  className="object-contain select-none"
                  sizes="100vw"
                  priority
                  draggable={false}
                />
              </div>
            </div>

            {hasMultiple ? (
              <>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    goPrev();
                  }}
                  className={`hidden md:inline-flex absolute top-1/2 -translate-y-1/2 z-[110] h-12 w-12 lg:h-14 lg:w-14 text-xl lg:text-2xl ${lightboxControlBtn}`}
                  style={{ left: "max(0.25rem, env(safe-area-inset-left, 0px))" }}
                  aria-label="Imagem anterior"
                >
                  ‹
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    goNext();
                  }}
                  className={`hidden md:inline-flex absolute top-1/2 -translate-y-1/2 z-[110] h-12 w-12 lg:h-14 lg:w-14 text-xl lg:text-2xl ${lightboxControlBtn}`}
                  style={{ right: "max(0.25rem, env(safe-area-inset-right, 0px))" }}
                  aria-label="Próxima imagem"
                >
                  ›
                </button>
              </>
            ) : null}
          </div>

          {hasMultiple ? (
            <div className="flex md:hidden shrink-0 items-center justify-between gap-3 pt-3">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  goPrev();
                }}
                className={`h-12 w-12 text-2xl ${lightboxControlBtn}`}
                aria-label="Imagem anterior"
              >
                ‹
              </button>
              <span className="text-sm font-medium text-white/85 tabular-nums">
                {validIndex} / {validCount}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  goNext();
                }}
                className={`h-12 w-12 text-2xl ${lightboxControlBtn}`}
                aria-label="Próxima imagem"
              >
                ›
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
