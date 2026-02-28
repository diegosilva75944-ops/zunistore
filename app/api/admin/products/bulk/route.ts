import { NextResponse } from "next/server";
import { z } from "zod";
import {
  adminBulkDeleteProducts,
  adminBulkMarkNeedsUpdate,
  adminBulkUpdateCategory,
} from "@/lib/admin/db";

export const runtime = "nodejs";

const schema = z.object({
  ids: z.array(z.string().uuid()).min(1),
  action: z.enum(["change_category", "mark_needs_update", "unmark_needs_update", "remove"]),
  categoryId: z.string().uuid().optional(),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Payload inválido." }, { status: 400 });
  }

  const { ids, action, categoryId } = parsed.data;

  if (action === "change_category") {
    if (!categoryId) {
      return NextResponse.json({ ok: false, error: "categoryId obrigatório." }, { status: 400 });
    }
    await adminBulkUpdateCategory(ids, categoryId);
  } else if (action === "mark_needs_update") {
    await adminBulkMarkNeedsUpdate(ids, true);
  } else if (action === "unmark_needs_update") {
    await adminBulkMarkNeedsUpdate(ids, false);
  } else if (action === "remove") {
    await adminBulkDeleteProducts(ids);
  }

  return NextResponse.json({ ok: true });
}

