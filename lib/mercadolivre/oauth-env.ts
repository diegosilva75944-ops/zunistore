import "server-only";

import { z } from "zod";

const schema = z.object({
  MERCADOLIVRE_CLIENT_ID: z.string().min(1),
  MERCADOLIVRE_CLIENT_SECRET: z.string().min(1),
  MERCADOLIVRE_REDIRECT_URI: z.string().url(),
  MERCADOLIVRE_AUTH_URL: z.string().url(),
  MERCADOLIVRE_API_URL: z.string().url(),
});

export type MercadoLivreOAuthEnv = z.infer<typeof schema>;

export function requireMercadoLivreOAuthEnv(): MercadoLivreOAuthEnv {
  const parsed = schema.safeParse({
    MERCADOLIVRE_CLIENT_ID: process.env.MERCADOLIVRE_CLIENT_ID,
    MERCADOLIVRE_CLIENT_SECRET: process.env.MERCADOLIVRE_CLIENT_SECRET,
    MERCADOLIVRE_REDIRECT_URI: process.env.MERCADOLIVRE_REDIRECT_URI,
    MERCADOLIVRE_AUTH_URL: process.env.MERCADOLIVRE_AUTH_URL,
    MERCADOLIVRE_API_URL: process.env.MERCADOLIVRE_API_URL,
  });
  if (!parsed.success) {
    throw new Error("Variáveis MERCADOLIVRE_* não configuradas corretamente no servidor.");
  }
  return parsed.data;
}

