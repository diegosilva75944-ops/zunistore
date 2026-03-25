"use client";

import Image from "next/image";
import { useState, useRef, useCallback, useEffect } from "react";

type ProductGalleryProps = {
  images: string[];
  title: string;
};

const lightboxControlBtn =
  "flex items-center justify-center rounded-full bg-white/55 backdrop-blur-md text-zinc-800 shadow-lg ring-1 ring-white/45 hover:bg-white/70 transition-colors";

export function ProductGallery({ images, title }: ProductGalleryProps) {
  const [selected, setSelected] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lens, setLens] = useState({ show: false, x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const imgs = images?.length ? images : [null];
  const mainSrc = imgs[selected] ?? imgs[0];

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!containerRef.current || !mainSrc) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      setLens({ show: true, x, y });
    },
    [mainSrc]
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

  return (
    <div className="space-y-3">
      {/* Foto principal com lupa ao passar o mouse */}
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
            {/* Lupa: círculo que segue o cursor com zoom 2x */}
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

      {/* Miniaturas da galeria */}
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
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4 md:p-8"
          role="dialog"
          aria-modal="true"
          aria-label={`${title} — imagem em tamanho grande`}
          onClick={() => setLightboxOpen(false)}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setLightboxOpen(false);
            }}
            className={`absolute right-3 top-3 z-[110] h-11 w-11 ${lightboxControlBtn} text-2xl font-light leading-none`}
            aria-label="Fechar"
          >
            ×
          </button>
          {imgs.filter(Boolean).length > 1 ? (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  goPrev();
                }}
                className={`absolute left-2 md:left-4 top-1/2 z-[110] -translate-y-1/2 h-12 w-12 md:h-14 md:w-14 text-xl md:text-2xl ${lightboxControlBtn}`}
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
                className={`absolute right-2 md:right-4 top-1/2 z-[110] -translate-y-1/2 h-12 w-12 md:h-14 md:w-14 text-xl md:text-2xl ${lightboxControlBtn}`}
                aria-label="Próxima imagem"
              >
                ›
              </button>
            </>
          ) : null}
          <div
            className="relative max-h-[min(100vh-2rem,100dvh-2rem)] max-w-[min(100vw-2rem,100dvw-2rem)] h-[min(90vh,90dvh)] w-full sm:w-[min(96vw,1400px)]"
            onClick={(e) => e.stopPropagation()}
          >
            <Image
              src={mainSrc}
              alt={title}
              fill
              className="object-contain"
              sizes="100vw"
              priority
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
