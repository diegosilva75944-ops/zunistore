import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";
import { runCronMlFullReimportAll } from "@/services/mercadolivre/cron-ml-reimport";

export const runtime = "nodejs";
/** Vários produtos + Playwright: use o máximo permitido no host (ex.: Vercel Pro até 900s). */
export const maxDuration = 900;

function jsonFromBatch(result: Awaited<ReturnType<typeof runCronMlFullReimportAll>>) {
  if (!result.ok) {
    return {
      ok: false as const,
      mode: "ml_full_reimport" as const,
      error: result.error,
    };
  }
  if (result.skipped) {
    return {
      ok: true as const,
      mode: "ml_full_reimport" as const,
      skipped: true,
      reason: result.reason,
      total: result.total,
      reimported: result.reimported,
      deleted: result.deleted,
      failed: result.failed,
      skipped_no_url: result.skipped_no_url,
      failures: result.failures.slice(0, 40),
      dedupe_removed: result.dedupe_removed ?? 0,
      dedupe_errors: (result.dedupe_errors ?? []).slice(0, 20),
    };
  }
  return {
    ok: true as const,
    mode: "ml_full_reimport" as const,
    skipped: false,
    total: result.total,
    reimported: result.reimported,
    deleted: result.deleted,
    failed: result.failed,
    skipped_no_url: result.skipped_no_url,
    failures: result.failures.slice(0, 40),
    updated: result.reimported,
    skipped_legacy: 0,
    dedupe_removed: result.dedupe_removed,
    dedupe_errors: result.dedupe_errors.slice(0, 20),
  };
}

export async function GET(_req: Request) {
  const result = await runCronMlFullReimportAll();
  const body = jsonFromBatch(result);
  if (!result.ok) {
    return NextResponse.json(body, { status: 500 });
  }
  return NextResponse.json(body);
}

export async function POST(_req: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  }

  const result = await runCronMlFullReimportAll();
  const body = jsonFromBatch(result);
  if (!result.ok) {
    return NextResponse.json(body, { status: 500 });
  }
  return NextResponse.json(body);
}
