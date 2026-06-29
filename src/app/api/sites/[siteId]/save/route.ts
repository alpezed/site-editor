import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { saveSite } from "@/lib/editor/save";

const schema = z.object({ message: z.string().max(200).optional() });

/** Run the Save workflow: apply edits → commit → push → record deployment. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const { siteId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = schema.safeParse(await request.json().catch(() => ({})));
  const message = body.success ? body.data.message : undefined;

  try {
    const result = await saveSite({ siteId, userId: user.id, message });
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "save_failed";
    const status = msg === "No changes to save" ? 409 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
