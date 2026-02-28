"use client";

import Image from "next/image";
import { useState, useRef, useCallback } from "react";

type ProductGalleryProps = {
  images: string[];
  title: string;
};

export function ProductGallery({ images, title }: ProductGalleryProps) {
  const [selected, setSelected] = useState(0);
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

  return (
    <div className="space-y-3">
      {/* Foto principal com lupa ao passar o mouse */}
      <div
        ref={containerRef}
        className="relative aspect-square rounded-2xl bg-white ring-1 ring-zinc-200 overflow-hidden cursor-zoom-in"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
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
    </div>
  );
}
