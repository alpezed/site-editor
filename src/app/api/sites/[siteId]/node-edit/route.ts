import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { applyNodeEditToSite } from "@/lib/sandbox/service";
import type { Patch } from "@/lib/editor/node-edit";

const patchSchema = z.union([
  z.object({ kind: z.literal("text"), value: z.string() }),
  z.object({
    kind: z.literal("classes"),
    group: z.string(),
    token: z.string().nullable(),
  }),
  z.object({ kind: z.literal("attr"), name: z.string(), value: z.string() }),
  z.object({
    kind: z.literal("op"),
    op: z.enum(["move-up", "move-down", "duplicate", "delete"]),
  }),
]);

const schema = z.object({ sxId: z.string().min(1), patch: patchSchema });

/**
 * Apply a single visual-editor node edit (style class / text / attribute /
 * structural op) to the element identified by its data-sx-id. Stores a file
 * override and hot-reloads the sandbox. 422 when the element can't be located or
 * the edit would produce invalid source — the client then keeps prior state.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const { siteId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  try {
    const result = await applyNodeEditToSite(
      siteId,
      user.id,
      parsed.data.sxId,
      parsed.data.patch as Patch,
    );
    if (!result) {
      return NextResponse.json(
        { error: "Could not apply this edit to the source." },
        { status: 422 },
      );
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "node_edit_failed";
    const status = msg === "No running preview" ? 409 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
