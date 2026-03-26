"use client";

import { useState } from "react";
import type { TestMlImportResult } from "@/lib/ml-test";

type Props = {
  data: TestMlImportResult;
};

export function TestMlImportDebug({ data }: Props) {
  const [open, setOpen] = useState(true);

  return (
    <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-4">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between text-left text-sm font-semibold text-zinc-800"
      >
        Debug (candidatos, passos, sinais)
        <span className="text-zinc-500">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-3 text-xs">
          <div>
            <div className="font-semibold text-zinc-700 mb-1">Passos</div>
            <ul className="list-disc pl-4 space-y-0.5 text-zinc-600 font-mono">
              {data.debug.extractionSteps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>

          {data.debug.chosenBlock && (
            <div>
              <div className="font-semibold text-zinc-700 mb-1">Bloco principal vencedor</div>
              <div className="rounded-lg bg-white p-2 ring-1 ring-zinc-200 space-y-1 text-zinc-600">
                <div>
                  <span className="text-zinc-500">Seletor:</span>{" "}
                  <span className="font-mono">{data.debug.chosenBlock.selector}</span>
                </div>
                <div>
                  <span className="text-zinc-500">Preço riscado no DOM:</span>{" "}
                  {data.debug.chosenBlock.hasStrikethroughPrevious ? "sim" : "não"}
                </div>
                <div>
                  <span className="text-zinc-500">Contagens:</span> anterior no bloco ={" "}
                  {data.debug.chosenBlock.previousInBlockCount}, atual (andes) ={" "}
                  {data.debug.chosenBlock.currentInBlockCount}
                </div>
                {data.debug.chosenBlock.notes.length > 0 && (
                  <ul className="list-disc pl-4 mt-1">
                    {data.debug.chosenBlock.notes.map((n, i) => (
                      <li key={i}>{n}</li>
                    ))}
                  </ul>
                )}
                {data.debug.chosenBlock.snippet && (
                  <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap wrap-break-word text-[11px] text-zinc-600">
                    {data.debug.chosenBlock.snippet}
                  </pre>
                )}
              </div>
            </div>
          )}

          <div>
            <div className="font-semibold text-zinc-700 mb-1">Candidatos de preço ({data.debug.candidates.length})</div>
            <div className="overflow-x-auto rounded-lg bg-white ring-1 ring-zinc-200">
              <table className="min-w-full text-left text-[11px]">
                <thead className="bg-zinc-100 text-zinc-700">
                  <tr>
                    <th className="px-2 py-1">valor</th>
                    <th className="px-2 py-1">fonte</th>
                    <th className="px-2 py-1">main</th>
                    <th className="px-2 py-1">orig</th>
                    <th className="px-2 py-1">atual</th>
                    <th className="px-2 py-1">parc</th>
                    <th className="px-2 py-1">reco</th>
                  </tr>
                </thead>
                <tbody>
                  {data.debug.candidates.map((c, i) => (
                    <tr key={i} className="border-t border-zinc-100">
                      <td className="px-2 py-1 font-mono">{c.value}</td>
                      <td className="px-2 py-1">{c.source}</td>
                      <td className="px-2 py-1">{c.fromMainBlock ? "sim" : "não"}</td>
                      <td className="px-2 py-1">{c.isOriginalCandidate ? "sim" : ""}</td>
                      <td className="px-2 py-1">{c.isCurrentCandidate ? "sim" : ""}</td>
                      <td className="px-2 py-1">{c.isInstallment ? "sim" : ""}</td>
                      <td className="px-2 py-1">{c.isRecommendation ? "sim" : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {data.debug.ignoredCandidates.length > 0 && (
            <div>
              <div className="font-semibold text-zinc-700 mb-1">
                Candidatos ignorados na UI ({data.debug.ignoredCandidates.length})
              </div>
              <div className="overflow-x-auto rounded-lg bg-white ring-1 ring-zinc-200">
                <table className="min-w-full text-left text-[11px]">
                  <thead className="bg-zinc-100 text-zinc-700">
                    <tr>
                      <th className="px-2 py-1">índice</th>
                      <th className="px-2 py-1">valor</th>
                      <th className="px-2 py-1">fonte</th>
                      <th className="px-2 py-1">motivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.debug.ignoredCandidates.map((row, i) => (
                      <tr key={i} className="border-t border-zinc-100">
                        <td className="px-2 py-1 font-mono">{row.index}</td>
                        <td className="px-2 py-1 font-mono">{row.value}</td>
                        <td className="px-2 py-1">{row.source}</td>
                        <td className="px-2 py-1 text-zinc-600">{row.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <details className="rounded-lg bg-white p-2 ring-1 ring-zinc-200">
            <summary className="cursor-pointer font-semibold text-zinc-700">chosenSignals (JSON)</summary>
            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all text-[11px] text-zinc-600">
              {JSON.stringify(data.debug.chosenSignals, null, 2)}
            </pre>
          </details>

          <details className="rounded-lg bg-white p-2 ring-1 ring-zinc-200">
            <summary className="cursor-pointer font-semibold text-zinc-700">rawSignals (JSON)</summary>
            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all text-[11px] text-zinc-600">
              {JSON.stringify(data.debug.rawSignals, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}
