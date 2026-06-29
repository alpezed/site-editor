import { Octokit } from "octokit";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { refreshAccessToken } from "@/lib/github/oauth";
import type { GithubConnection } from "@prisma/client";

/**
 * GitHub App access layer. We authenticate as the user using the OAuth
 * access token. Tokens are refreshed transparently when expired.
 */

/** Returns a valid Octokit client for a connection, refreshing if expired. */
export async function octokitForConnection(
  connection: GithubConnection,
): Promise<Octokit> {
  let token = connection.accessToken;

  const expired =
    connection.expiresAt && connection.expiresAt.getTime() < Date.now() + 60_000;

  if (expired && connection.refreshToken) {
    const refreshed = await refreshAccessToken(connection.refreshToken);
    token = refreshed.accessToken;
    await prisma.githubConnection.update({
      where: { id: connection.id },
      data: {
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken ?? connection.refreshToken,
        expiresAt: refreshed.expiresAt,
      },
    });
  }

  return new Octokit({ auth: token });
}

export interface RepoSummary {
  id: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  private: boolean;
}

/** List repositories the user's installation can access. */
export async function listRepositories(
  connection: GithubConnection,
): Promise<RepoSummary[]> {
  const octokit = await octokitForConnection(connection);

  // A GitHub App user token only sees private repos through the app's
  // installations. Enumerate every installation the user can access and
  // aggregate their repos — don't rely on a single stored installationId,
  // which is stale if the app was installed after the OAuth connect.
  const installations = await octokit.paginate("GET /user/installations", {
    per_page: 100,
  });

  let repos: unknown[];
  if (installations.length > 0) {
    const perInstall = await Promise.all(
      installations.map((inst) =>
        octokit.paginate(
          "GET /user/installations/{installation_id}/repositories",
          { installation_id: inst.id, per_page: 100 },
        ),
      ),
    );
    repos = perInstall.flat();
  } else {
    // No installation — best effort with the user's OAuth-accessible repos.
    repos = await octokit.paginate("GET /user/repos", {
      per_page: 100,
      sort: "updated",
      visibility: "all",
      affiliation: "owner,collaborator,organization_member",
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (repos as any[]).map((r) => ({
    id: String(r.id),
    name: r.name,
    fullName: r.full_name,
    defaultBranch: r.default_branch ?? "main",
    private: r.private,
  }));
}

/** Read a single file's decoded content from a repo. */
export async function getFileContent(
  connection: GithubConnection,
  owner: string,
  repo: string,
  path: string,
  ref?: string,
): Promise<string | null> {
  const octokit = await octokitForConnection(connection);
  try {
    const { data } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path,
      ref,
    });
    if (Array.isArray(data) || data.type !== "file" || !("content" in data)) {
      return null;
    }
    return Buffer.from(data.content, "base64").toString("utf8");
  } catch {
    return null;
  }
}

/** Recursively list the repo tree for a ref. */
export async function getTree(
  connection: GithubConnection,
  owner: string,
  repo: string,
  ref: string,
): Promise<string[]> {
  const octokit = await octokitForConnection(connection);
  const { data: refData } = await octokit.rest.git.getRef({
    owner,
    repo,
    ref: `heads/${ref}`,
  });
  const { data } = await octokit.rest.git.getTree({
    owner,
    repo,
    tree_sha: refData.object.sha,
    recursive: "true",
  });
  return data.tree
    .filter((t) => t.type === "blob" && t.path)
    .map((t) => t.path!);
}

export interface FileChange {
  path: string;
  content: string;
}

/**
 * Commit a set of file changes and push to the branch. Returns the new commit
 * SHA. Implemented with the git data API so multiple files land in one commit.
 */
export async function commitFiles(
  connection: GithubConnection,
  owner: string,
  repo: string,
  branch: string,
  message: string,
  changes: FileChange[],
): Promise<string> {
  const octokit = await octokitForConnection(connection);

  const { data: refData } = await octokit.rest.git.getRef({
    owner,
    repo,
    ref: `heads/${branch}`,
  });
  const baseSha = refData.object.sha;

  const { data: baseCommit } = await octokit.rest.git.getCommit({
    owner,
    repo,
    commit_sha: baseSha,
  });

  const blobs = await Promise.all(
    changes.map(async (change) => {
      const { data: blob } = await octokit.rest.git.createBlob({
        owner,
        repo,
        content: Buffer.from(change.content, "utf8").toString("base64"),
        encoding: "base64",
      });
      return { path: change.path, sha: blob.sha };
    }),
  );

  const { data: tree } = await octokit.rest.git.createTree({
    owner,
    repo,
    base_tree: baseCommit.tree.sha,
    tree: blobs.map((b) => ({
      path: b.path,
      mode: "100644",
      type: "blob",
      sha: b.sha,
    })),
  });

  const { data: commit } = await octokit.rest.git.createCommit({
    owner,
    repo,
    message,
    tree: tree.sha,
    parents: [baseSha],
  });

  await octokit.rest.git.updateRef({
    owner,
    repo,
    ref: `heads/${branch}`,
    sha: commit.sha,
  });

  return commit.sha;
}

/** URL to install / configure the GitHub App for a user. */
export function getInstallUrl(state: string): string {
  const url = new URL(`https://github.com/apps/${env.github.appSlug}/installations/new`);
  url.searchParams.set("state", state);
  return url.toString();
}
