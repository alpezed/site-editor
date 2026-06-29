import { prisma } from "@/lib/prisma";
import { commitFiles, getFileContent } from "@/lib/github/app";
import { applyFieldEdits } from "@/lib/editor/ast";
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

  const [owner, repoName] = repo.repositoryName.split("/");
  const branch = repo.branch || repo.defaultBranch;

  const changes: { path: string; content: string }[] = [];
  for (const [filePath, fields] of Object.entries(pending)) {
    const current = await getFileContent(connection, owner, repoName, filePath, branch);
    if (current == null) continue;
    const edits = Object.entries(fields).map(([field, value]) => ({
      field,
      value,
    }));
    const next = applyFieldEdits(current, edits);
    if (next !== current) changes.push({ path: filePath, content: next });
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

  // Clear pending edits now they're committed.
  if (session) {
    await prisma.editorSession.update({
      where: { id: session.id },
      data: { state: { ...state, pending: {} } as object },
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
