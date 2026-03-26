import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /** Evita empacotar o Playwright no bundle do servidor; o binário vem de `playwright install chromium`. */
  serverExternalPackages: ["playwright"],
  /** Garante que o pacote `playwright` entre no trace do standalone (sync de preços ML). */
  outputFileTracingIncludes: {
    "/api/cron/sync-prices/route": [
      "./node_modules/playwright/**/*",
      "./node_modules/playwright-core/**/*",
    ],
    "/api/admin/products/[id]/sync-price/route": [
      "./node_modules/playwright/**/*",
      "./node_modules/playwright-core/**/*",
    ],
    "/api/admin/products/sync-prices-ml-batch/route": [
      "./node_modules/playwright/**/*",
      "./node_modules/playwright-core/**/*",
    ],
  },
  /** Reforço CORS para import pela extensão Chrome (middleware também define). */
  async headers() {
    return [
      {
        source: "/api/admin/import/mercadolivre",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "POST, OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type, Authorization" },
        ],
      },
    ];
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "http2.mlstatic.com" },
      { protocol: "https", hostname: "mlstatic.com" },
      { protocol: "https", hostname: "*.mlstatic.com" },
      { protocol: "https", hostname: "*.supabase.co" },
    ],
  },
};

export default nextConfig;
