import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { importRepository } from "@/lib/import/run";
import { logAudit } from "@/lib/audit";

/** Import / re-scan the connected repository for a site. */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const { siteId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const site = await prisma.site.findFirst({
    where: { id: siteId, ownerId: user.id },
    include: { repository: { include: { githubConnection: true } } },
  });
  if (!site) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!site.repository) {
    return NextResponse.json({ error: "no_repository" }, { status: 409 });
  }

  try {
    const result = await importRepository(
      site.repository.githubConnection,
      site.repository,
    );
    if (!result.supported) {
      return NextResponse.json(
        { error: "unsupported_framework", reason: result.reason },
        { status: 422 },
      );
    }
    await logAudit(user.id, "site.import", site.id, {
      framework: result.framework,
      components: result.metadata?.components.length ?? 0,
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: "import_failed", detail: String(err) },
      { status: 500 },
    );
  }
}
