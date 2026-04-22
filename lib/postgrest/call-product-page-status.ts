/**
 * Chamada ao RPC `product_page_status` compatível com Edge (middleware).
 * Não importa `server-only`.
 */
import { getPostgrestAnonKey, getPostgrestBaseUrl } from "@/lib/postgrest/config";
import { parseProductPageStatusRpcBody, type ProductPageRpcPayload } from "@/lib/product-seo";

export async function fetchProductPageStatusRpc(code6: string, slug: string): Promise<ProductPageRpcPayload | null> {
  const base = getPostgrestBaseUrl();
  const key = getPostgrestAnonKey();
  if (!base || !key || key === "local-dev-key") return null;

  const url = `${base.replace(/\/$/, "")}/rpc/product_page_status`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({ p_code6: code6, p_slug: slug }),
      next: { revalidate: 0 },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as unknown;
    return parseProductPageStatusRpcBody(json);
  } catch {
    return null;
  }
}
