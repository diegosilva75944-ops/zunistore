import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";
import {
  mlAdminFullPipelineResultToJson,
  runMlAdminFullPipeline,
} from "@/services/mercadolivre/ml-admin-full-pipeline";

export const runtime = "nodejs";
/** Reimportação ML + validação de afiliados + Playwright: máximo no host (ex.: 900s). */
export const maxDuration = 900;

export async function GET(_req: Request) {
  const result = await runMlAdminFullPipeline();
  const body = mlAdminFullPipelineResultToJson(result);
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

  const result = await runMlAdminFullPipeline();
  const body = mlAdminFullPipelineResultToJson(result);
  if (!result.ok) {
    return NextResponse.json(body, { status: 500 });
  }
  return NextResponse.json(body);
}
