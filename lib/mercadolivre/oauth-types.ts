import { z } from "zod";

export const mlTokenResponseSchema = z.object({
  access_token: z.string(),
  token_type: z.string().optional().default("bearer"),
  expires_in: z.number(),
  scope: z.string().optional().nullable(),
  user_id: z.union([z.number(), z.string()]),
  refresh_token: z.string(),
});

export type MlTokenResponse = z.infer<typeof mlTokenResponseSchema>;

