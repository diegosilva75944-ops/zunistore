"use client";

import type { FormEvent, ReactNode } from "react";
import { useRouter } from "next/navigation";

/**
 * Evita reload completo do formulário "Todos os produtos" na home; navega no cliente
 * com âncora #todos-produtos para o scroll ser corrigido por HomeAllProductsScroll.
 */
export function HomeTodosProdutosFilterForm({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const router = useRouter();

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const p = new URLSearchParams();

    const categoria = fd.get("categoria");
    if (typeof categoria === "string" && categoria.trim()) p.set("categoria", categoria.trim());

    const min = fd.get("min");
    if (typeof min === "string" && min.trim()) p.set("min", min.trim());

    const max = fd.get("max");
    if (typeof max === "string" && max.trim()) p.set("max", max.trim());

    const ord = fd.get("ord");
    if (typeof ord === "string" && ord.trim()) p.set("ord", ord.trim());

    const pp = fd.get("pp");
    if (typeof pp === "string" && pp.trim()) p.set("pp", pp.trim());

    p.set("p", "1");

    const qs = p.toString();
    router.push(qs ? `/?${qs}#todos-produtos` : "/#todos-produtos", { scroll: false });
  }

  return (
    <form className={className} onSubmit={onSubmit}>
      {children}
    </form>
  );
}
