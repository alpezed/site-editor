import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recordDeployment } from "@/lib/deploy/service";
import { DeploymentTrigger } from "@prisma/client";

const schema = z.object({
  trigger: z.enum(["MANUAL", "REDEPLOY"]).default("MANUAL"),
});

/** Manually trigger a deploy / redeploy for a site. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const { siteId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const site = await prisma.site.findFirst({
    where: { id: siteId, ownerId: user.id },
    include: { repository: true },
  });
  if (!site) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!site.repository) {
    return NextResponse.json({ error: "no_repository" }, { status: 409 });
  }

  const body = schema.safeParse(await request.json().catch(() => ({})));
  const trigger = body.success ? body.data.trigger : "MANUAL";

  const deployment = await recordDeployment({
    siteId: site.id,
    trigger: trigger as DeploymentTrigger,
    repoId: site.repository.repositoryId,
    ref: site.repository.branch,
    fire: true,
  });

  return NextResponse.json({ deployment });
}
