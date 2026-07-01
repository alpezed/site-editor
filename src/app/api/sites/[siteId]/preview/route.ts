import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { startPreview, stopPreview, previewLogs } from "@/lib/sandbox/service";
import type { SandboxStatus } from "@/lib/sandbox/types";

/** Start the live-preview sandbox for a site. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const { siteId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const wantsStream =
    request.nextUrl.searchParams.get("stream") === "1" ||
    request.headers.get("accept")?.includes("application/x-ndjson");

  if (wantsStream) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        };
        const sendStatus = (status: SandboxStatus) => send({ ...status });
        try {
          const sandbox = await startPreview(siteId, user.id, sendStatus);
          send({
            stage: "ready",
            message: "Live preview ready",
            previewUrl: sandbox.previewUrl,
            sandboxId: sandbox.id,
          });
        } catch (err) {
          send({
            stage: "error",
            message: err instanceof Error ? err.message : "preview_failed",
            error: true,
          });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "content-type": "application/x-ndjson; charset=utf-8",
        "cache-control": "no-cache, no-transform",
      },
    });
  }

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
