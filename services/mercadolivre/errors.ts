export type MercadoLivreErrorCode =
  | "invalid_link"
  | "invalid_item_id"
  | "not_found"
  | "inactive"
  | "rate_limited"
  | "timeout"
  | "network"
  | "unexpected_response";

export class MercadoLivreError extends Error {
  readonly code: MercadoLivreErrorCode;
  readonly status?: number;
  readonly details?: unknown;

  constructor(
    code: MercadoLivreErrorCode,
    message: string,
    opts?: { status?: number; details?: unknown; cause?: unknown },
  ) {
    super(message);
    this.name = "MercadoLivreError";
    this.code = code;
    this.status = opts?.status;
    this.details = opts?.details;
    if (opts?.cause) (this as any).cause = opts.cause;
  }
}

