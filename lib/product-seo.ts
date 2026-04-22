/**
 * Resolução central de SEO/HTTP para páginas de produto (PDP).
 * Usar com o RPC `product_page_status` e a linha em `products` (quando existir).
 */

export type ProductPageRpcKind = "active" | "inactive" | "gone" | "missing" | "slug_mismatch" | "redirect";

export type ProductPageRpcPayload = {
  kind: ProductPageRpcKind;
  canonical_slug?: string;
  target_code6?: string;
  target_slug?: string;
};

export type ProductSeoResolution = {
  status: 200 | 404 | 410;
  shouldIndex: boolean;
  /** Caminho interno, ex: `/produto/XXXXXX/slug-do-produto` */
  redirectTo?: string;
  slugCanonical?: string;
  rpcKind?: ProductPageRpcKind;
};

function buildPdpPath(code6: string, slug: string): string {
  return `/produto/${encodeURIComponent(code6)}/${encodeURIComponent(slug)}`;
}

/**
 * Prioridade: linha em `products` (fonte de verdade); se não existir, usa só o RPC (gone/missing/redirect por slug).
 */
export function getProductSeoResolution(opts: {
  rpc: ProductPageRpcPayload | null;
  product: {
    slug: string;
    is_active?: boolean;
    redirect_code6?: string | null;
    redirect_slug?: string | null;
  } | null;
  urlSlug: string;
  code6: string;
}): ProductSeoResolution {
  const { rpc, product, urlSlug, code6 } = opts;

  if (product) {
    if (product.slug !== urlSlug) {
      return {
        status: 200,
        shouldIndex: false,
        redirectTo: buildPdpPath(code6, product.slug),
        slugCanonical: product.slug,
        rpcKind: "slug_mismatch",
      };
    }
    const rc = product.redirect_code6?.trim();
    const rs = product.redirect_slug?.trim();
    if (rc && rs) {
      return {
        status: 200,
        shouldIndex: false,
        redirectTo: buildPdpPath(rc, rs),
        rpcKind: "redirect",
      };
    }
    if (product.is_active === false) {
      return { status: 200, shouldIndex: false, rpcKind: "inactive" };
    }
    return { status: 200, shouldIndex: true, rpcKind: "active" };
  }

  if (rpc?.kind === "gone") {
    return { status: 410, shouldIndex: false, rpcKind: "gone" };
  }
  if (rpc?.kind === "slug_mismatch" && rpc.canonical_slug) {
    return {
      status: 200,
      shouldIndex: false,
      redirectTo: buildPdpPath(code6, rpc.canonical_slug),
      slugCanonical: rpc.canonical_slug,
      rpcKind: "slug_mismatch",
    };
  }
  if (rpc?.kind === "redirect" && rpc.target_code6 && rpc.target_slug) {
    return {
      status: 200,
      shouldIndex: false,
      redirectTo: buildPdpPath(rpc.target_code6, rpc.target_slug),
      rpcKind: "redirect",
    };
  }

  return { status: 404, shouldIndex: false, rpcKind: rpc?.kind === "missing" ? "missing" : "missing" };
}

/** Decisão só com o RPC (Edge/middleware), alinhada a `product_page_status`. */
export type PdpMiddlewareDecision =
  | { action: "continue" }
  | { action: "gone" }
  | { action: "redirect"; location: string };

export function resolvePdpMiddlewareFromRpc(
  rpc: ProductPageRpcPayload | null,
  code6: string,
): PdpMiddlewareDecision {
  if (!rpc) return { action: "continue" };
  if (rpc.kind === "gone") return { action: "gone" };
  if (rpc.kind === "redirect" && rpc.target_code6 && rpc.target_slug) {
    return {
      action: "redirect",
      location: `/produto/${encodeURIComponent(rpc.target_code6)}/${encodeURIComponent(rpc.target_slug)}`,
    };
  }
  if (rpc.kind === "slug_mismatch" && rpc.canonical_slug) {
    return {
      action: "redirect",
      location: `/produto/${encodeURIComponent(code6)}/${encodeURIComponent(rpc.canonical_slug)}`,
    };
  }
  return { action: "continue" };
}

export function parseProductPageStatusRpcBody(json: unknown): ProductPageRpcPayload | null {
  if (json == null) return null;
  let root: unknown = json;
  if (Array.isArray(json) && json.length === 1) root = json[0];
  if (typeof root !== "object" || root == null) return null;
  const obj = root as Record<string, unknown>;
  let inner: unknown =
    obj.product_page_status ?? obj.product_page_status_result ?? obj.result ?? obj;
  if (typeof inner === "string") {
    try {
      inner = JSON.parse(inner) as object;
    } catch {
      return null;
    }
  }
  if (!inner || typeof inner !== "object") return null;
  const k = (inner as Record<string, unknown>).kind;
  if (typeof k !== "string") return null;
  return inner as ProductPageRpcPayload;
}
