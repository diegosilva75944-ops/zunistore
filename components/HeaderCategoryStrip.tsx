"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { getCategoryLucideIcon } from "@/lib/category-lucide-icon";
import { cn } from "@/lib/cn";

export type HeaderCategoryStripItem = {
  id: string;
  name: string;
  slug: string;
  subcategories: { id: string; name: string; slug: string }[];
};

function stripActiveSlug(pathname: string | null): string | null {
  if (!pathname?.startsWith("/categoria/")) return null;
  const seg = pathname.slice("/categoria/".length).split("/")[0];
  return seg ? decodeURIComponent(seg) : null;
}

function isItemActive(pathname: string | null, item: HeaderCategoryStripItem): boolean {
  const current = stripActiveSlug(pathname);
  if (!current) return false;
  if (current === item.slug) return true;
  return item.subcategories.some((s) => s.slug === current);
}

function ChevronMenu({ open }: { open: boolean }) {
  return (
    <svg
      className={cn(
        "h-3.5 w-3.5 shrink-0 text-zinc-500 transition-transform duration-200 ease-in-out",
        open && "rotate-180",
      )}
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden
    >
      <path d="M3 4.5L6 7.5L9 4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function HeaderCategoryStrip({ items }: { items: HeaderCategoryStripItem[] }) {
  const pathname = usePathname();
  const [openId, setOpenId] = useState<string | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearCloseTimer = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    clearCloseTimer();
    closeTimer.current = setTimeout(() => setOpenId(null), 220);
  }, [clearCloseTimer]);

  useEffect(() => () => clearCloseTimer(), [clearCloseTimer]);

  if (items.length === 0) return null;

  return (
    <nav
      className="header-category-strip-nav relative z-[60] isolate w-full border-b border-[var(--zuni-primary)]/[0.12] bg-[color-mix(in_srgb,var(--zuni-purple-light)_42%,var(--zuni-page-bg))]"
      aria-label="Categorias em destaque"
    >
      <div className="zuni-site-container overflow-visible">
        <ul
          className={cn(
            "flex md:grid gap-2 md:gap-2.5 py-2 md:py-2.5",
            "overflow-x-auto md:overflow-visible overflow-y-visible",
            "snap-x snap-mandatory md:snap-none",
            "header-category-scroll",
            "md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7",
            "[scrollbar-width:thin]",
          )}
        >
          {items.map((item, index) => {
            const hasSubs = item.subcategories.length > 0;
            const open = openId === item.id;
            const active = isItemActive(pathname, item);
            const Icon = getCategoryLucideIcon(item.name, item.slug);

            return (
              <li
                key={item.id}
                className={cn(
                  "header-category-strip-item relative min-w-0 snap-start shrink-0",
                  "w-[min(78vw,13.5rem)] sm:w-[min(52vw,14rem)] md:w-auto md:shrink",
                  open ? "z-50" : "z-0",
                )}
                style={
                  {
                    "--header-category-enter-delay": `${Math.min(index, 12) * 40}ms`,
                  } as CSSProperties
                }
                onMouseEnter={() => {
                  clearCloseTimer();
                  if (hasSubs) setOpenId(item.id);
                  else setOpenId(null);
                }}
                onMouseLeave={scheduleClose}
              >
                <div
                  className={cn(
                    "flex w-full overflow-hidden rounded-xl border bg-[color-mix(in_srgb,white_88%,var(--zuni-purple-light))]",
                    "border-[var(--zuni-primary)]/10 shadow-[0_1px_1px_rgba(76,29,149,0.04)]",
                    "transition-[box-shadow,transform,border-color] duration-200 ease-in-out",
                    "md:hover:scale-[1.02] md:hover:border-[var(--zuni-primary)]/28 md:hover:shadow-[0_2px_10px_-3px_rgba(109,40,217,0.14)]",
                    active &&
                      "border-[var(--zuni-primary)]/50 bg-[color-mix(in_srgb,var(--zuni-purple-light)_55%,white)] ring-1 ring-[var(--zuni-primary)]/25",
                    open && "border-[var(--zuni-primary)]/22 shadow-[0_2px_8px_-4px_rgba(76,29,149,0.12)]",
                  )}
                >
                  <Link
                    href={`/categoria/${item.slug}`}
                    className={cn(
                      "group flex min-w-0 flex-1 flex-row items-center gap-2 px-3 py-2 text-left",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--zuni-primary)]/45 focus-visible:ring-offset-1 focus-visible:ring-offset-[color-mix(in_srgb,var(--zuni-purple-light)_42%,var(--zuni-page-bg))]",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--zuni-primary)]/10 text-[var(--zuni-primary)]",
                        active && "bg-[var(--zuni-primary)]/18 text-[var(--zuni-purple-dark)]",
                      )}
                      aria-hidden
                    >
                      <Icon className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
                    </span>
                    <span
                      className={cn(
                        "flex min-w-0 flex-1 items-center gap-1 text-[0.8125rem] font-medium leading-snug tracking-[0.01em] text-zinc-900",
                        "md:text-[0.8125rem]",
                      )}
                    >
                      <span className="min-w-0 truncate">{item.name}</span>
                      <ChevronRight
                        className="hidden h-3 w-3 shrink-0 text-[var(--zuni-primary)]/50 opacity-0 transition-opacity duration-200 group-hover:opacity-100 md:inline"
                        strokeWidth={2}
                        aria-hidden
                      />
                    </span>
                  </Link>
                  {hasSubs ? (
                    <button
                      type="button"
                      className={cn(
                        "flex shrink-0 items-center justify-center border-l border-[var(--zuni-primary)]/10 px-2 md:hidden",
                        "text-zinc-600 active:bg-[var(--zuni-primary)]/8",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--zuni-primary)]/35",
                      )}
                      aria-expanded={open}
                      aria-haspopup="true"
                      aria-label={`Abrir subcategorias de ${item.name}`}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setOpenId((o) => (o === item.id ? null : item.id));
                      }}
                    >
                      <ChevronMenu open={open} />
                    </button>
                  ) : null}
                </div>

                {hasSubs ? (
                  <div
                    className={cn(
                      "absolute left-0 top-[calc(100%+0.25rem)] z-[70] w-max min-w-[12.5rem] max-w-[min(22rem,calc(100vw-1.75rem))]",
                      "rounded-xl border border-[var(--zuni-primary)]/12 bg-[color-mix(in_srgb,white_94%,var(--zuni-purple-light))] py-1.5",
                      "shadow-[0_6px_24px_-8px_rgba(76,29,149,0.15)]",
                      "transition-opacity duration-200 ease-out",
                      open ? "visible opacity-100 pointer-events-auto" : "invisible opacity-0 pointer-events-none",
                    )}
                    role="menu"
                    onMouseEnter={clearCloseTimer}
                    onMouseLeave={scheduleClose}
                  >
                    <ul className="max-h-[min(70vh,22rem)] overflow-y-auto overscroll-contain">
                      <li role="none">
                        <Link
                          role="menuitem"
                          href={`/categoria/${item.slug}`}
                          className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold tracking-wide text-[var(--zuni-primary)] hover:bg-[var(--zuni-purple-light)]/60"
                          onClick={() => setOpenId(null)}
                        >
                          Ver tudo em «{item.name}»
                          <ChevronRight className="h-3 w-3 opacity-70" strokeWidth={2} aria-hidden />
                        </Link>
                      </li>
                      <li className="mx-3 my-1 h-px bg-[var(--zuni-primary)]/10" aria-hidden />
                      {item.subcategories.map((sub) => (
                        <li key={sub.id} role="none">
                          <Link
                            role="menuitem"
                            href={`/categoria/${sub.slug}`}
                            className="block px-3 py-1.5 text-sm font-medium text-zinc-900 hover:bg-[var(--zuni-purple-light)]/70"
                            onClick={() => setOpenId(null)}
                          >
                            {sub.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
