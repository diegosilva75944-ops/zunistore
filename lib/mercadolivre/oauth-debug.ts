import "server-only";

import { PostgrestError } from "@/lib/postgrest/server";

export function serializeError(e: unknown): Record<string, unknown> {
  if (e instanceof PostgrestError) {
    return {
      name: e.name,
      message: e.message,
      status: e.status,
      details: e.details,
    };
  }
  if (e instanceof Error) {
    return {
      name: e.name,
      message: e.message,
      stack: process.env.NODE_ENV !== "production" ? e.stack : undefined,
    };
  }
  return { message: String(e) };
}

