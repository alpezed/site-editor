import { prisma } from "@/lib/prisma";
import { getSandboxDriver } from "@/lib/sandbox";
import { octokitForConnection } from "@/lib/github/app";
import { applyFieldEdits } from "@/lib/editor/ast";
import type { EditorState } from "@/lib/editor/types";

/**
 * Bridges editor sessions and the sandbox driver. Owns the lifecycle of the
 * live-preview sandbox for a site and keeps `editor_sessions.sandboxId` /
 * `previewUrl` in sync.
 */

async function loadSite(siteId: string, userId: string) {
  return prisma.site.findFirst({
    where: { id: siteId, ownerId: userId },
    include: { repository: { include: { githubConnection: true } } },
  });
}

async function latestSession(siteId: string) {
  return prisma.editorSession.findFirst({
    where: { siteId },
    orderBy: { updatedAt: "desc" },
  });
}

/** Start (or restart) the preview sandbox for a site, returning the URL. */
export async function startPreview(siteId: string, userId: string) {
  const site = await loadSite(siteId, userId);
  if (!site?.repository) throw new Error("No repository connected");

  const connection = site.repository.githubConnection;
  const branch = site.repository.branch || site.repository.defaultBranch;

  // Ensure the cached access token is fresh before handing it to the sandbox.
  await octokitForConnection(connection);
  const fresh = await prisma.githubConnection.findUniqueOrThrow({
    where: { id: connection.id },
  });

  const driver = getSandboxDriver();
  const sandbox = await driver.create({
    repoFullName: site.repository.repositoryName,
    branch,
    accessToken: fresh.accessToken,
  });

  const existing = await latestSession(siteId);
  const state = (existing?.state as unknown as EditorState) ?? { pending: {} };
  if (existing) {
    await prisma.editorSession.update({
      where: { id: existing.id },
      data: { sandboxId: sandbox.id, previewUrl: sandbox.previewUrl },
    });
  } else {
    await prisma.editorSession.create({
      data: {
        siteId,
        state: state as object,
        sandboxId: sandbox.id,
        previewUrl: sandbox.previewUrl,
      },
    });
  }

  return sandbox;
}

/**
 * Push the current pending edits into the running sandbox so the dev server
 * hot-reloads. Reads each file from the repo, applies the edits and writes the
 * result into the sandbox (without committing).
 */
export async function syncPreview(siteId: string, userId: string) {
  const site = await loadSite(siteId, userId);
  if (!site?.repository) throw new Error("No repository connected");

  const session = await latestSession(siteId);
  if (!session?.sandboxId) throw new Error("No running preview");

  const state = (session.state as unknown as EditorState) ?? { pending: {} };
  const pending = state.pending ?? {};
  if (Object.keys(pending).length === 0) return { written: 0 };

  const connection = site.repository.githubConnection;
  const [owner, repo] = site.repository.repositoryName.split("/");
  const branch = site.repository.branch || site.repository.defaultBranch;
  const { getFileContent } = await import("@/lib/github/app");

  const files: { path: string; content: string }[] = [];
  for (const [filePath, fields] of Object.entries(pending)) {
    const current = await getFileContent(connection, owner, repo, filePath, branch);
    if (current == null) continue;
    const edits = Object.entries(fields).map(([field, value]) => ({
      field,
      value,
    }));
    const next = applyFieldEdits(current, edits);
    if (next !== current) files.push({ path: filePath, content: next });
  }

  if (files.length > 0) {
    await getSandboxDriver().writeFiles(session.sandboxId, files);
  }
  return { written: files.length };
}

/** Tear down the preview sandbox for a site. */
export async function stopPreview(siteId: string, userId: string) {
  const site = await loadSite(siteId, userId);
  if (!site) throw new Error("Not found");
  const session = await latestSession(siteId);
  if (!session?.sandboxId) return;
  await getSandboxDriver().destroy(session.sandboxId);
  await prisma.editorSession.update({
    where: { id: session.id },
    data: { sandboxId: null, previewUrl: null },
  });
}

/** Dev-server logs from the running sandbox. */
export async function previewLogs(siteId: string, userId: string) {
  const site = await loadSite(siteId, userId);
  if (!site) throw new Error("Not found");
  const session = await latestSession(siteId);
  if (!session?.sandboxId) return [];
  return getSandboxDriver().logs(session.sandboxId);
}
