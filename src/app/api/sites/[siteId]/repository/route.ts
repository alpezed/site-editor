import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { getConnection } from "@/lib/github/connection";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

const connectSchema = z.object({
  repositoryId: z.string(),
  repositoryName: z.string(), // owner/repo
  branch: z.string().default("main"),
  defaultBranch: z.string().default("main"),
});

async function ownedSite(siteId: string, userId: string) {
  return prisma.site.findFirst({ where: { id: siteId, ownerId: userId } });
}

/** Connect a GitHub repository to a site (one repo per site for the MVP). */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const { siteId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const site = await ownedSite(siteId, user.id);
  if (!site) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const connection = await getConnection(user.id);
  if (!connection) {
    return NextResponse.json({ error: "github_not_connected" }, { status: 409 });
  }

  const body = connectSchema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json(
      { error: "invalid", detail: body.error.issues },
      { status: 400 },
    );
  }

  const repo = await prisma.siteRepository.upsert({
    where: { siteId: site.id },
    create: {
      siteId: site.id,
      githubConnectionId: connection.id,
      ...body.data,
    },
    update: {
      githubConnectionId: connection.id,
      ...body.data,
    },
  });

  await logAudit(user.id, "site.repository.connect", site.id, {
    repository: body.data.repositoryName,
  });

  return NextResponse.json({ repository: repo });
}

/** Disconnect the repository from a site. */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const { siteId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const site = await ownedSite(siteId, user.id);
  if (!site) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.siteRepository.deleteMany({ where: { siteId: site.id } });
  await logAudit(user.id, "site.repository.disconnect", site.id);
  return NextResponse.json({ ok: true });
}
