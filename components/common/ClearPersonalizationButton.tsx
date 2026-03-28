"use client";

import { useState } from "react";
import { limparHistoricoPersonalizacao } from "@/lib/tracking";

export function ClearPersonalizationButton() {
  const [done, setDone] = useState(false);

  return (
    <button
      type="button"
      onClick={() => {
        limparHistoricoPersonalizacao();
        setDone(true);
        setTimeout(() => setDone(false), 4000);
      }}
      className="text-xs text-zinc-500 hover:text-zuni-primary underline-offset-2 hover:underline"
    >
      {done ? "Histórico deste dispositivo limpo." : "Limpar recomendações e histórico deste dispositivo"}
    </button>
  );
}
