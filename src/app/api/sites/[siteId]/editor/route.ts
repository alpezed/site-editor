import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const stateSchema = z.object({
  pending: z.record(z.string(), z.record(z.string(), z.string())),
  textEdits: z.record(z.string(), z.string()).optional(),
  sections: z
    .array(
      z.union([
        z.string(),
        z.object({
          key: z.string(),
          id: z.string(),
          builderId: z.string().nullish(),
        }),
      ]),
    )
    .optional(),
  fileOverrides: z.record(z.string(), z.string()).optional(),
  activeRoute: z.string().nullish(),
  activeFile: z.string().nullish(),
});

async function ownedSite(siteId: string, userId: string) {
  return prisma.site.findFirst({ where: { id: siteId, ownerId: userId } });
}

/** Load the latest editor session (autosave) for a site. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const { siteId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await ownedSite(siteId, user.id)))
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const session = await prisma.editorSession.findFirst({
    where: { siteId },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json({ state: session?.state ?? { pending: {} } });
}

/** Autosave editor state (pending field edits). */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const { siteId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await ownedSite(siteId, user.id)))
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = stateSchema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const existing = await prisma.editorSession.findFirst({
    where: { siteId },
    orderBy: { updatedAt: "desc" },
  });

  const session = existing
    ? await prisma.editorSession.update({
        where: { id: existing.id },
        data: { state: body.data as object },
      })
    : await prisma.editorSession.create({
        data: { siteId, state: body.data as object },
      });

  return NextResponse.json({ id: session.id });
}
