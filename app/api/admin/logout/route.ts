import { NextResponse } from "next/server";
import { clearAdminSessionCookie } from "@/lib/admin/auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  await clearAdminSessionCookie();
  const url = new URL(req.url);
  const base = `${url.protocol}//${url.host}`;
  return NextResponse.redirect(`${base}/`, 302);
}

