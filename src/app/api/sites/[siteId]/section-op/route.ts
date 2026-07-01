import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getFileContent, getTree } from "@/lib/github/app";
import { applyElementOp, removeComponentUsage } from "@/lib/editor/element-ops";
import { applyNodeEdit } from "@/lib/editor/node-edit";
import { parseSxId } from "@/lib/editor/stamp";
import { homeRouteFile } from "@/lib/editor/sections";
import { normalizeSections, sectionInstancePath } from "@/lib/editor/types";
import { getSandboxDriver } from "@/lib/sandbox";
import type { EditorState } from "@/lib/editor/types";
import type { ProjectMetadata } from "@/lib/import/component-scanner";

const schema = z
  .object({
    op: z.enum(["move-up", "move-down", "duplicate", "delete"]),
    // nullish: the agent sends `sxId: null` for unstamped nodes and may send an
    // empty anchor — accept both, then require at least one usable value.
    anchor: z.string().nullish(),
    // Stable source loc of the selected element (data-sx-id). Preferred over the
    // text anchor: it pins text-less elements (<img>) and disambiguates dupes.
    sxId: z.string().nullish(),
  })
  .refine((d) => d.sxId || d.anchor, "need sxId or anchor");

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
  const { op, anchor, sxId } = parsed.data;

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
  const sections = normalizeSections(state.sections);

  // Effective current content, in priority order:
  //   1. an existing override (a prior in-preview edit),
  //   2. the LIVE sandbox file — the truth the iframe renders, including
  //      session-added sections whose component files were never pushed,
  //   3. the committed repo source.
  const driver = getSandboxDriver();
  const sandboxId = session?.sandboxId ?? null;
  const effective = async (p: string) => {
    if (overrides[p] != null) return overrides[p];
    if (sandboxId) {
      const live = await driver.readFile(sandboxId, p);
      if (live != null) return live;
    }
    return await getFileContent(connection, owner, repoName, p, branch);
  };

  // Candidates: home route, the staged section component files (sandbox-only —
  // not in the repo tree), then the rest of the repo's code files.
  const homePath = homeRouteFile(repo.metadata as unknown as ProjectMetadata | null);
  const appIdx = homePath.indexOf("app/");
  const base = appIdx > 0 ? homePath.slice(0, appIdx) : "";
  const sectionFiles = sections.map((s) => base + sectionInstancePath(s.name));
  const candidates = [homePath, ...sectionFiles];
  const tree = await getTree(connection, owner, repoName, branch).catch(() => []);
  for (const p of tree) {
    if (candidates.includes(p)) continue;
    if (/\.(tsx|jsx)$/.test(p) && !p.includes("node_modules")) candidates.push(p);
  }

  let hitPath: string | null = null;
  let next: string | null = null;
  let removedSectionKey: string | undefined;

  // Preferred: locate by the stable source loc (data-sx-id).
  const loc = sxId ? parseSxId(sxId) : null;
  if (loc) {
    // A click inside a section carries the component-file loc
    // (site-editor-sections/<Name>.tsx) — the file name IS the component name.
    // Deleting means stripping a <Name/> tag (+ import if last) from the file that
    // renders it, not editing the (shared) component file the click points into.
    const name = /site-editor-sections\/([^/]+)\.tsx$/.exec(loc.filePath)?.[1];
    if (op === "delete" && name) {
      for (const p of candidates.slice(0, 200)) {
        const current = await effective(p);
        if (current == null || !current.includes(name)) continue;
        const result = removeComponentUsage(current, name);
        if (result != null && result !== current) {
          hitPath = p;
          next = result;
          // Staged placement: drop the first instance with this name so a later
          // sync doesn't re-insert its tag.
          removedSectionKey = sections.find((s) => s.name === name)?.key;
          break;
        }
      }
    } else if (!name) {
      const current = await effective(loc.filePath);
      if (current != null) {
        const result = applyNodeEdit(
          current,
          { line: loc.line, column: loc.column },
          { kind: "op", op },
        );
        if (result != null && result !== current) {
          hitPath = loc.filePath;
          next = result;
        }
      }
    }
  }

  // Fallback: text-anchor locator (unstamped instant-preview nodes).
  if ((!hitPath || next == null) && anchor) {
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
  }

  if (!hitPath || next == null) {
    return NextResponse.json(
      { error: "Could not locate this element in source." },
      { status: 404 },
    );
  }

  const nextOverrides = { ...overrides, [hitPath]: next };
  const nextSections = removedSectionKey
    ? sections.filter((s) => s.key !== removedSectionKey)
    : state.sections;
  if (session) {
    await prisma.editorSession.update({
      where: { id: session.id },
      data: {
        state: {
          ...state,
          fileOverrides: nextOverrides,
          sections: nextSections,
        } as object,
      },
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

  return NextResponse.json({ ok: true, file: hitPath, content: next, removedSectionKey });
}
