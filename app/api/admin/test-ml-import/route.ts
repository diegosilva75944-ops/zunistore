import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession } from "@/lib/admin/auth";
import { runTestMlImport, type ImportMode } from "@/lib/ml-test";

export const runtime = "nodejs";
export const maxDuration = 120;

const bodySchema = z.object({
  url: z.string().min(12, "URL inválida."),
  mode: z.enum(["auto", "html", "headless"]).optional().default("auto"),
});

export async function POST(req: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.flatten().formErrors.join(" ") },
      { status: 400 },
    );
  }

  const { url, mode } = parsed.data;

  try {
    const result = await runTestMlImport(url, mode as ImportMode, { returnPartialOnBlock: true });
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Falha ao processar a URL.";
    return NextResponse.json({ ok: false, error: message }, { status: 422 });
  }
}
