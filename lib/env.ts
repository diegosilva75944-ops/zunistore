import { z } from "zod";

const schema = z.object({
  NEXT_PUBLIC_SITE_URL: z.string().url().optional(),

  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  ADMIN_JWT_SECRET: z.string().min(32),
  ADMIN_JWT_COOKIE_NAME: z.string().min(1).default("zuni_admin"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null | undefined;

export function getOptionalEnv(): Env | null {
  if (cached !== undefined) return cached;
  const apiUrl =
    process.env.POSTGREST_URL ?? process.env.DB_API_URL ?? process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.DB_ANON_KEY ?? "local-dev-key";
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.DB_SERVICE_ROLE_KEY ??
    process.env.DB_SERVICE_KEY ??
    anonKey;
  const parsed = schema.safeParse({
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    SUPABASE_URL: apiUrl,
    SUPABASE_ANON_KEY: anonKey,
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
    ADMIN_JWT_SECRET: process.env.ADMIN_JWT_SECRET,
    ADMIN_JWT_COOKIE_NAME: process.env.ADMIN_JWT_COOKIE_NAME,
  });
  cached = parsed.success ? parsed.data : null;
  return cached;
}

export function requireEnv(): Env {
  const env = getOptionalEnv();
  if (!env) {
    throw new Error(
      "Variáveis de ambiente obrigatórias ausentes. Configure POSTGREST_URL ou DB_API_URL ou SUPABASE_URL, chaves da API PostgREST (SUPABASE_ANON_KEY/… ou DB_ANON_KEY/…) e ADMIN_JWT_SECRET.",
    );
  }
  return env;
}

