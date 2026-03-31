import { NextResponse } from "next/server";
import { getMobileAppApiKey } from "@/lib/mobile-app/auth";

export const runtime = "nodejs";

export async function GET() {
  const configured = Boolean(getMobileAppApiKey());
  return NextResponse.json({
    ok: true,
    service: "zunistore-mobile-api",
    mobile_key_configured: configured,
  });
}
