import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /** Playwright só roda no servidor (import dinâmico na rota de teste). */
  serverExternalPackages: ["playwright"],
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
