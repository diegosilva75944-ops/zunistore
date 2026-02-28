import "server-only";

import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { requireEnv } from "@/lib/env";

type AdminSessionPayload = {
  sub: string;
  username: string;
};

function getSecret() {
  const env = requireEnv();
  return new TextEncoder().encode(env.ADMIN_JWT_SECRET);
}

export async function setAdminSessionCookie(payload: AdminSessionPayload) {
  const env = requireEnv();
  const token = await new SignJWT({ username: payload.username })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime("14d")
    .sign(getSecret());

  const jar = await cookies();
  jar.set(env.ADMIN_JWT_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
}

export async function clearAdminSessionCookie() {
  const env = requireEnv();
  const jar = await cookies();
  jar.set(env.ADMIN_JWT_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export async function getAdminSession() {
  const env = requireEnv();
  const jar = await cookies();
  const token = jar.get(env.ADMIN_JWT_COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const verified = await jwtVerify(token, getSecret(), { algorithms: ["HS256"] });
    const sub = verified.payload.sub;
    const username = verified.payload.username;
    if (typeof sub !== "string" || typeof username !== "string") return null;
    return { id: sub, username };
  } catch {
    return null;
  }
}

