import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getFileContent, getTree } from "@/lib/github/app";
import { applyElementOp } from "@/lib/editor/element-ops";
import { homeRouteFile } from "@/lib/editor/sections";
import type { EditorState } from "@/lib/editor/types";
import type { ProjectMetadata } from "@/lib/import/component-scanner";

const schema = z.object({
  op: z.enum(["move-up", "move-down", "duplicate", "delete"]),
  anchor: z.string().min(1),
});

/**
 * Apply an in-preview element op (reorder/duplicate/delete) to source. Finds the
 * file rendering the selected element by its text anchor, rewrites the JSX node,
 * stores the result as a file override, and writes it into the live sandbox.
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
  const { op, anchor } = parsed.data;

  const site = await prisma.site.findFirst({
    where: { id: siteId, ownerId: user.id },
    include: { repository: { include: { githubConnection: true } } },
  });
  if (!site?.repository) {
    return NextResponse.json({ error: "no_repository" }, { status: 409 });
  }

  const repo = site.repository;
  const connection = repo.githubConnection;
  const [owner, repoName] = repo.repositoryName.split("/");
  const branch = repo.branch || repo.defaultBranch;

  const session = await prisma.editorSession.findFirst({
    where: { siteId },
    orderBy: { updatedAt: "desc" },
  });
  const state = (session?.state as unknown as EditorState | undefined) ?? { pending: {} };
  const overrides = state.fileOverrides ?? {};

  // Effective current content: an existing override, else the repo source.
  const effective = async (p: string) =>
    overrides[p] ?? (await getFileContent(connection, owner, repoName, p, branch));

  // Try the home route first, then scan the repo's code files for the anchor.
  const homePath = homeRouteFile(repo.metadata as unknown as ProjectMetadata | null);
  const candidates = [homePath];
  const tree = await getTree(connection, owner, repoName, branch);
  for (const p of tree) {
    if (p === homePath) continue;
    if (/\.(tsx|jsx)$/.test(p) && !p.includes("node_modules")) candidates.push(p);
  }

  let hitPath: string | null = null;
  let next: string | null = null;
  for (const p of candidates.slice(0, 200)) {
    const current = await effective(p);
    if (current == null || !current.includes(anchor.trim().split(/\s+/)[0])) continue;
    const result = applyElementOp(current, anchor, op);
    if (result != null && result !== current) {
      hitPath = p;
      next = result;
      break;
    }
  }

  if (!hitPath || next == null) {
    return NextResponse.json(
      { error: "Could not locate this element in source." },
      { status: 404 },
    );
  }

  const nextOverrides = { ...overrides, [hitPath]: next };
  if (session) {
    await prisma.editorSession.update({
      where: { id: session.id },
      data: { state: { ...state, fileOverrides: nextOverrides } as object },
    });
  }

  // Write into the running sandbox so the dev server hot-reloads.
  if (session?.sandboxId) {
    try {
      const { getSandboxDriver } = await import("@/lib/sandbox");
      await getSandboxDriver().writeFiles(session.sandboxId, [
        { path: hitPath, content: next },
      ]);
    } catch {
      // best-effort live refresh; the override is persisted regardless.
    }
  }

  return NextResponse.json({ ok: true, file: hitPath, content: next });
}
