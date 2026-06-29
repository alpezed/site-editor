import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import type { DeploymentStatus } from "@prisma/client";

/**
 * Vercel webhook. Mirrors deployment lifecycle events into the `deployments`
 * table so the editor can show live progress.
 *
 * Configure the webhook in the Vercel dashboard and (recommended) verify the
 * `x-vercel-signature` header against your webhook secret — left as a TODO.
 */
const EVENT_TO_STATUS: Record<string, DeploymentStatus> = {
  "deployment.created": "QUEUED",
  "deployment.building": "BUILDING",
  "deployment.succeeded": "READY",
  "deployment.ready": "READY",
  "deployment.error": "ERROR",
  "deployment.canceled": "CANCELED",
};

export async function POST(request: NextRequest) {
  const payload = await request.json().catch(() => null);
  if (!payload) return NextResponse.json({ ok: true });

  const type: string = payload.type ?? "";
  const deploymentId: string | undefined =
    payload.payload?.deployment?.id ?? payload.payload?.deploymentId;
  const url: string | undefined = payload.payload?.deployment?.url;

  const status = EVENT_TO_STATUS[type];
  if (deploymentId && status) {
    await prisma.deployment.updateMany({
      where: { deploymentId },
      data: { status, url },
    });
  }

  return NextResponse.json({ ok: true });
}
