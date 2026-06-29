export type Framework = "nextjs" | "unknown";

export interface FrameworkDetection {
  framework: Framework;
  supported: boolean;
  reason?: string;
}

/**
 * Detect the project framework from the repo file list + package.json.
 * MVP supports Next.js only, detected by:
 *  - a `next` dependency in package.json, and
 *  - an `app/` or `pages/` directory.
 */
export function detectFramework(
  filePaths: string[],
  packageJson: Record<string, unknown> | null,
): FrameworkDetection {
  const deps = {
    ...(packageJson?.dependencies as Record<string, string> | undefined),
    ...(packageJson?.devDependencies as Record<string, string> | undefined),
  };
  const hasNextDep = Boolean(deps?.next);
  const hasAppDir = filePaths.some(
    (p) => p === "app" || p.startsWith("app/") || p.startsWith("src/app/"),
  );
  const hasPagesDir = filePaths.some(
    (p) => p === "pages" || p.startsWith("pages/") || p.startsWith("src/pages/"),
  );

  if (hasNextDep && (hasAppDir || hasPagesDir)) {
    return { framework: "nextjs", supported: true };
  }

  return {
    framework: "unknown",
    supported: false,
    reason: "Only Next.js projects are currently supported.",
  };
}
