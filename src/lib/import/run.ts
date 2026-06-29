import { prisma } from "@/lib/prisma";
import { getFileContent, getTree } from "@/lib/github/app";
import { detectFramework } from "@/lib/import/framework-detect";
import { scanProject, type ProjectMetadata } from "@/lib/import/component-scanner";
import type { GithubConnection, SiteRepository } from "@prisma/client";

const CODE_EXT = /\.(tsx|jsx|ts|js)$/;
/** Limit how many code files we read on import to keep it fast. */
const MAX_CODE_FILES = 400;

export interface ImportResult {
  framework: string;
  supported: boolean;
  reason?: string;
  metadata?: ProjectMetadata;
}

/**
 * Import a connected repository: read the tree, detect the framework, scan the
 * project and persist metadata on the SiteRepository. Returns an unsupported
 * result (without persisting) when the project is not Next.js.
 */
export async function importRepository(
  connection: GithubConnection,
  siteRepo: SiteRepository,
): Promise<ImportResult> {
  const [owner, repo] = siteRepo.repositoryName.split("/");
  const branch = siteRepo.branch || siteRepo.defaultBranch;

  const paths = await getTree(connection, owner, repo, branch);

  const pkgRaw = await getFileContent(
    connection,
    owner,
    repo,
    "package.json",
    branch,
  );
  const packageJson = pkgRaw ? safeJson(pkgRaw) : null;

  const detection = detectFramework(paths, packageJson);
  if (!detection.supported) {
    return {
      framework: detection.framework,
      supported: false,
      reason: detection.reason,
    };
  }

  const codeFiles = paths
    .filter((p) => CODE_EXT.test(p))
    .slice(0, MAX_CODE_FILES);

  const contents: Record<string, string> = {};
  await Promise.all(
    codeFiles.map(async (path) => {
      const content = await getFileContent(connection, owner, repo, path, branch);
      if (content) contents[path] = content;
    }),
  );

  const metadata = scanProject(paths, contents);

  await prisma.siteRepository.update({
    where: { id: siteRepo.id },
    data: {
      framework: detection.framework,
      metadata: metadata as unknown as object,
      importedAt: new Date(),
    },
  });

  return { framework: detection.framework, supported: true, metadata };
}

function safeJson(raw: string): Record<string, unknown> | null {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
