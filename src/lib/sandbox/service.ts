import { prisma } from "@/lib/prisma";
import { getSandboxDriver } from "@/lib/sandbox";
import { octokitForConnection } from "@/lib/github/app";
import { applyFieldEdits, applySectionAdds, applyTextEdits } from "@/lib/editor/ast";
import { planSectionsForHome } from "@/lib/editor/sections";
import { stampSource, stripSxIds, parseSxId } from "@/lib/editor/stamp";
import { applyNodeEdit, type Patch } from "@/lib/editor/node-edit";
import type { ProjectMetadata } from "@/lib/import/component-scanner";
import { type EditorState, normalizeSections } from "@/lib/editor/types";

const CODE_RE = /\.(tsx|jsx)$/;

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

  // Stamp the whole project so the visual editor can locate any element by its
  // data-sx-id. Files are already cloned into the sandbox — read locally, stamp,
  // write back. Best-effort: a failure just disables precise selection.
  const [owner, repoName] = site.repository.repositoryName.split("/");
  void stampProject(sandbox.id, connection, owner, repoName, branch);

  return sandbox;
}

/** Read each code file from the sandbox, stamp it with data-sx-id, write back. */
async function stampProject(
  sandboxId: string,
  connection: Parameters<typeof octokitForConnection>[0],
  owner: string,
  repoName: string,
  branch: string,
): Promise<void> {
  try {
    const { getTree } = await import("@/lib/github/app");
    const driver = getSandboxDriver();
    const paths = (await getTree(connection, owner, repoName, branch))
      .filter((p) => CODE_RE.test(p) && !p.includes("node_modules"))
      .slice(0, 400);
    const files: { path: string; content: string }[] = [];
    for (const p of paths) {
      const raw = await driver.readFile(sandboxId, p);
      if (raw == null || raw.includes("data-sx-id")) continue;
      const stamped = stampSource(p, raw);
      if (stamped !== raw) files.push({ path: p, content: stamped });
    }
    if (files.length > 0) await driver.writeFiles(sandboxId, files);
  } catch {
    /* selection just won't be precise until next sync */
  }
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
  const sections = normalizeSections(state.sections);
  const overrides = state.fileOverrides ?? {};
  const textEdits = state.textEdits ?? {};
  if (
    Object.keys(pending).length === 0 &&
    sections.length === 0 &&
    Object.keys(overrides).length === 0 &&
    Object.keys(textEdits).length === 0
  ) {
    return { written: 0 };
  }

  const connection = site.repository.githubConnection;
  const [owner, repo] = site.repository.repositoryName.split("/");
  const branch = site.repository.branch || site.repository.defaultBranch;
  const { getFileContent, getTree } = await import("@/lib/github/app");

  // Cache fetched sources so the home file (possibly touched by both a field
  // edit and a section add) is fetched once and composed in order.
  const fetched = new Map<string, string>();
  const load = async (p: string) => {
    if (!fetched.has(p)) {
      const c = await getFileContent(connection, owner, repo, p, branch);
      if (c != null) fetched.set(p, c);
    }
    return fetched.get(p);
  };

  const edited = new Map<string, string>();
  for (const [filePath, fields] of Object.entries(pending)) {
    const current = await load(filePath);
    if (current == null) continue;
    const edits = Object.entries(fields).map(([field, value]) => ({ field, value }));
    edited.set(filePath, applyFieldEdits(current, edits));
  }

  // Sections: write each instance's component file now. The home-page tags are
  // appended LAST (after overrides) so a stale page.tsx override can't wipe them.
  const sectionPlan =
    sections.length > 0
      ? await planSectionsForHome(
          site.repository.metadata as unknown as ProjectMetadata | null,
          sections,
          load,
        )
      : null;
  if (sectionPlan) {
    for (const f of sectionPlan.files) edited.set(f.path, f.content);
  }

  // Click-to-edit text edits: matched by value across the repo's code files so
  // a reload renders them from source (they otherwise live only in the iframe's
  // contentEditable DOM and revert on reload). Applied on top of field edits.
  const textEditList = Object.entries(textEdits).map(([from, to]) => ({ from, to }));
  if (textEditList.length > 0) {
    const tree = await getTree(connection, owner, repo, branch).catch(() => []);
    const codeFiles = tree
      .filter((p) => /\.(tsx|jsx|ts|js|mdx)$/.test(p) && !p.includes("node_modules"))
      .slice(0, 200);
    // Union with already-edited files so section instance files (sandbox-only,
    // never in the repo tree) also receive the text edit and persist it.
    const targets = new Set<string>([...edited.keys(), ...codeFiles]);
    for (const p of targets) {
      const current = edited.get(p) ?? (await load(p));
      if (current == null) continue;
      edited.set(p, applyTextEdits(current, textEditList));
    }
  }

  // Whole-file overrides from in-preview element ops win per file.
  for (const [p, content] of Object.entries(overrides)) edited.set(p, content);

  // Append section tags to the home page LAST — on top of any override — so the
  // staged sections are authoritative and never clobbered. Idempotent per
  // instance, so this never duplicates if the override already carried them.
  if (sectionPlan) {
    const base = edited.get(sectionPlan.homePath) ?? sectionPlan.homeSource;
    edited.set(sectionPlan.homePath, applySectionAdds(base, sectionPlan.additions));
  }

  const files: { path: string; content: string }[] = [];
  for (const [path, content] of edited) {
    if (content !== fetched.get(path)) files.push({ path, content });
  }

  if (files.length > 0) {
    // Sandbox copy is stamped for selection; overrides/commit stay unstamped.
    await getSandboxDriver().writeFiles(
      session.sandboxId,
      files.map((f) => ({ path: f.path, content: stampSource(f.path, f.content) })),
    );
  }
  return { written: files.length };
}

/**
 * Apply a single inspector/structural edit to the element identified by `sxId`.
 * The sandbox holds the live rendered+stamped truth, so we read that file, strip
 * the stamps to recover the source the sxId loc refers to, AST-edit it, persist
 * the (unstamped) result as a file override, and write the re-stamped version
 * back for hot reload. Returns null if the element can't be located / edited.
 */
export async function applyNodeEditToSite(
  siteId: string,
  userId: string,
  sxId: string,
  patch: Patch,
): Promise<{ file: string; content: string } | null> {
  const site = await loadSite(siteId, userId);
  if (!site?.repository) throw new Error("No repository connected");

  const parsed = parseSxId(sxId);
  if (!parsed) return null;
  const { filePath, line, column } = parsed;

  const session = await latestSession(siteId);
  if (!session?.sandboxId) throw new Error("No running preview");

  const driver = getSandboxDriver();
  const raw = await driver.readFile(session.sandboxId, filePath);
  if (raw == null) return null;

  const source = stripSxIds(raw);
  const next = applyNodeEdit(source, { line, column }, patch);
  if (next == null) return null;

  const state = (session.state as unknown as EditorState) ?? { pending: {} };
  const overrides = { ...(state.fileOverrides ?? {}), [filePath]: next };
  await prisma.editorSession.update({
    where: { id: session.id },
    data: { state: { ...state, fileOverrides: overrides } as object },
  });

  await driver.writeFiles(session.sandboxId, [
    { path: filePath, content: stampSource(filePath, next) },
  ]);

  return { file: filePath, content: next };
}

/**
 * Resolve the preview URL for page load. Sandboxes expire on inactivity, but
 * `previewUrl` is persisted — so verify the sandbox still exists and clear the
 * stale URL if it's gone, otherwise the iframe renders "Sandbox Not Found".
 */
export async function livePreviewUrl(siteId: string): Promise<string | null> {
  const session = await latestSession(siteId);
  if (!session?.sandboxId || !session.previewUrl) return null;
  if (await getSandboxDriver().isAlive(session.sandboxId)) {
    return session.previewUrl;
  }
  await prisma.editorSession.update({
    where: { id: session.id },
    data: { sandboxId: null, previewUrl: null },
  });
  return null;
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
