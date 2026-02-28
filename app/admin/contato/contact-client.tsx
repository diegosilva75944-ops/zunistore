"use client";

import { useEffect, useState } from "react";

export function ContactClient() {
  const [form, setForm] = useState({
    address: "",
    city: "",
    state: "",
    phone: "",
    email: "",
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/contact-settings")
      .then((r) => r.json())
      .then((data) => {
        const s = data?.settings;
        setForm({
          address: s?.address ?? "",
          city: s?.city ?? "",
          state: s?.state ?? "",
          phone: s?.phone ?? "",
          email: s?.email ?? "",
        });
      })
      .catch(() => {});
  }, []);

  async function save() {
    setBusy(true);
    setMsg(null);

    const res = await fetch("/api/admin/contact-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address: form.address || null,
        city: form.city || null,
        state: form.state || null,
        phone: form.phone || null,
        email: form.email || null,
      }),
    }).catch(() => null);

    setBusy(false);
    if (!res || !res.ok) {
      const data = res ? await res.json().catch(() => null) : null;
      setMsg(data?.error || "Falha ao salvar.");
      return;
    }
    setMsg("Salvo.");
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Endereço">
          <input
            value={form.address}
            onChange={(e) => setForm((s) => ({ ...s, address: e.target.value }))}
            className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
          />
        </Field>
        <Field label="Cidade">
          <input
            value={form.city}
            onChange={(e) => setForm((s) => ({ ...s, city: e.target.value }))}
            className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
          />
        </Field>
        <Field label="Estado (UF)">
          <input
            value={form.state}
            onChange={(e) => setForm((s) => ({ ...s, state: e.target.value }))}
            className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
          />
        </Field>
        <Field label="Telefone">
          <input
            value={form.phone}
            onChange={(e) => setForm((s) => ({ ...s, phone: e.target.value }))}
            className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
          />
        </Field>
        <Field label="E-mail">
          <input
            value={form.email}
            onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))}
            className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
          />
        </Field>
      </div>

      {msg ? (
        <div className="text-sm text-zinc-700 bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2">
          {msg}
        </div>
      ) : null}

      <button
        disabled={busy}
        onClick={save}
        className="rounded-full bg-zuni-primary px-6 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {busy ? "Salvando…" : "Salvar"}
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-semibold text-zinc-700">{label}</div>
      {children}
    </div>
  );
}

