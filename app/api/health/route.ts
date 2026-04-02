import { NextResponse } from "next/server";

/**
 * Health check leve para proxy/orquestradores (ex.: Coolify, Docker).
 * Sem DB, auth ou chamadas externas.
 */
export async function GET() {
  return NextResponse.json({
    status: "ok",
    app: "zunistore",
    timestamp: new Date().toISOString(),
  });
}
