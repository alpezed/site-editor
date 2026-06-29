import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { startPreview, stopPreview, previewLogs } from "@/lib/sandbox/service";

/** Start the live-preview sandbox for a site. */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const { siteId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const sandbox = await startPreview(siteId, user.id);
    return NextResponse.json({ previewUrl: sandbox.previewUrl, sandboxId: sandbox.id });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "preview_failed" },
      { status: 500 },
    );
  }
}

/** Recent dev-server logs. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const { siteId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const logs = await previewLogs(siteId, user.id);
  return NextResponse.json({ logs });
}

/** Tear down the preview sandbox. */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const { siteId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await stopPreview(siteId, user.id);
  return NextResponse.json({ ok: true });
}
