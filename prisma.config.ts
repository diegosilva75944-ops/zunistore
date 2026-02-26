import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    directUrl: env("DIRECT_URL"),
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});