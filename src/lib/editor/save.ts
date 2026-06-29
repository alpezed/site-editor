import { prisma } from "@/lib/prisma";
import { commitFiles, getFileContent, getTree } from "@/lib/github/app";
import { applyFieldEdits, applySectionAdds, applyTextEdits } from "@/lib/editor/ast";
import { homeRouteFile, planSectionAdditions } from "@/lib/editor/sections";
import type { ProjectMetadata } from "@/lib/import/component-scanner";
import { recordDeployment } from "@/lib/deploy/service";
import { logAudit } from "@/lib/audit";
import { DeploymentTrigger } from "@prisma/client";
import type { EditorState } from "@/lib/editor/types";

export interface SaveResult {
  commitHash: string;
  filesChanged: number;
  deploymentId: string;
}

/**
 * The Save workflow:
 *   1. Read pending edits from the editor session.
 *   2. For each changed file, fetch current source, apply field edits (AST).
 *   3. Commit all changes in one commit and push to the connected branch.
 *   4. Record a deployment (Vercel deploys automatically on push via its Git
 *      integration; the Vercel webhook then advances the status).
 *   5. Clear pending edits.
 */
export async function saveSite(opts: {
  siteId: string;
  userId: string;
  message?: string;
}): Promise<SaveResult> {
  const site = await prisma.site.findFirstOrThrow({
    where: { id: opts.siteId, ownerId: opts.userId },
    include: { repository: { include: { githubConnection: true } } },
  });

  const repo = site.repository;
  if (!repo) throw new Error("Site has no connected repository");
  const connection = repo.githubConnection;

  const session = await prisma.editorSession.findFirst({
    where: { siteId: site.id },
    orderBy: { updatedAt: "desc" },
  });
  const state =
    (session?.state as unknown as EditorState | undefined) ?? { pending: {} };
  const pending = state.pending ?? {};
  const textEdits = state.textEdits ?? {};
  const sections = state.sections ?? [];

  const [owner, repoName] = repo.repositoryName.split("/");
  const branch = repo.branch || repo.defaultBranch;

  // Build edits per file. Field edits target known files; click-to-edit text
  // edits are matched by value across the repo's code files. `orig`/`edited`
  // track each file's fetched source vs. its mutated copy.
  const orig = new Map<string, string>();
  const edited = new Map<string, string>();
  const load = async (p: string) => {
    if (!orig.has(p)) {
      const c = await getFileContent(connection, owner, repoName, p, branch);
      if (c != null) {
        orig.set(p, c);
        edited.set(p, c);
      }
    }
    return edited.get(p);
  };

  for (const [filePath, fields] of Object.entries(pending)) {
    const current = await load(filePath);
    if (current == null) continue;
    const fieldEdits = Object.entries(fields).map(([field, value]) => ({ field, value }));
    edited.set(filePath, applyFieldEdits(current, fieldEdits));
  }

  const textEditList = Object.entries(textEdits).map(([from, to]) => ({ from, to }));
  if (textEditList.length > 0) {
    // ponytail: scan up to 200 code files; large repos truncate silently.
    const tree = await getTree(connection, owner, repoName, branch);
    const codeFiles = tree
      .filter((p) => /\.(tsx|jsx|ts|js|mdx)$/.test(p) && !p.includes("node_modules"))
      .slice(0, 200);
    for (const p of codeFiles) {
      const current = await load(p);
      if (current == null) continue;
      edited.set(p, applyTextEdits(current, textEditList));
    }
  }

  // Sections staged from the gallery: write each component file and append its
  // tag to the home route source (composed on top of any field edits above).
  if (sections.length > 0) {
    const homePath = homeRouteFile(repo.metadata as unknown as ProjectMetadata | null);
    const { files: sectionFiles, additions } = planSectionAdditions(sections, homePath);
    for (const f of sectionFiles) edited.set(f.path, f.content);
    const home = await load(homePath);
    if (home != null) edited.set(homePath, applySectionAdds(home, additions));
  }

  // Whole-file overrides from in-preview element ops win per file.
  for (const [p, content] of Object.entries(state.fileOverrides ?? {})) {
    edited.set(p, content);
  }

  const changes: { path: string; content: string }[] = [];
  for (const [path, content] of edited) {
    if (content !== orig.get(path)) changes.push({ path, content });
  }

  if (changes.length === 0) {
    throw new Error("No changes to save");
  }

  const commitHash = await commitFiles(
    connection,
    owner,
    repoName,
    branch,
    opts.message ?? `Update content via Site Editor (${changes.length} files)`,
    changes,
  );

  const deployment = await recordDeployment({
    siteId: site.id,
    commitHash,
    trigger: DeploymentTrigger.AUTOMATIC,
  });

  // Mirror the committed files into the running preview sandbox so the iframe
  // reflects what was published. Text (click-to-edit) edits are otherwise never
  // written to the sandbox — they only live in the iframe's contentEditable DOM
  // — so a reload would render the stale clone. Best-effort: the commit stands.
  if (session?.sandboxId) {
    try {
      const { getSandboxDriver } = await import("@/lib/sandbox");
      await getSandboxDriver().writeFiles(session.sandboxId, changes);
    } catch {
      // preview refresh is best-effort; publish already succeeded.
    }
  }

  // Clear pending edits now they're committed.
  if (session) {
    await prisma.editorSession.update({
      where: { id: session.id },
      data: {
        state: { ...state, pending: {}, textEdits: {}, sections: [], fileOverrides: {} } as object,
      },
    });
  }

  await logAudit(opts.userId, "site.save", site.id, {
    commitHash,
    filesChanged: changes.length,
  });

  return {
    commitHash,
    filesChanged: changes.length,
    deploymentId: deployment.id,
  };
}
