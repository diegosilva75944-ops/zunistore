"use client";

import type { TestMagaluImportResult } from "@/lib/magalu-test";

type Props = {
  data: TestMagaluImportResult;
};

export function TestMagaluImportExtras({ data }: Props) {
  const entries = Object.entries(data.specs || {});
  if (!data.productIdFromUrl && entries.length === 0) return null;

  return (
    <div className="rounded-2xl border border-violet-200 bg-violet-50/40 p-4 md:p-5 space-y-4">
      {data.productIdFromUrl ? (
        <div>
          <h3 className="text-sm font-semibold text-zinc-800">Código no path (/p/…/)</h3>
          <p className="text-sm font-mono text-zinc-700 mt-1">{data.productIdFromUrl}</p>
        </div>
      ) : null}

      {entries.length > 0 ? (
        <div>
          <h3 className="text-sm font-semibold text-zinc-800 mb-2">
            Ficha técnica ({entries.length} campos)
          </h3>
          <div className="max-h-72 overflow-y-auto rounded-xl bg-white ring-1 ring-zinc-200">
            <table className="w-full text-sm">
              <tbody>
                {entries.map(([k, v]) => (
                  <tr key={k} className="border-b border-zinc-100 last:border-0">
                    <th className="text-left font-medium text-zinc-600 px-3 py-2 align-top w-[40%]">{k}</th>
                    <td className="text-zinc-900 px-3 py-2">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
