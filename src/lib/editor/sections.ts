import path from "node:path";
import { getSection, sectionFilePath } from "@/lib/sections/catalog";
import type { ProjectMetadata } from "@/lib/import/component-scanner";

/** The route file that added sections get appended to (the site's home page). */
export function homeRouteFile(metadata: ProjectMetadata | null | undefined): string {
  const home = metadata?.routes?.find(
    (r) => r.routePath === "/" || r.routePath === "",
  );
  return home?.filePath ?? "app/page.tsx";
}

/**
 * Pure planning step for staged sections: given the ordered catalog ids and the
 * home route path, return the section component files to write plus the
 * import/tag pairs to splice into the home file (via applySectionAdds).
 *
 * Section files are placed under the same base as the home route (`src/` or
 * repo root) so a relative import always resolves regardless of path-alias
 * config. Unknown ids are skipped.
 */
export function planSectionAdditions(
  sectionIds: string[],
  homePath: string,
): {
  files: { path: string; content: string }[];
  additions: { importLine: string; tag: string }[];
} {
  // base = the segment before "app/" — "src/" for src/app/page.tsx, "" for app/page.tsx.
  const appIdx = homePath.indexOf("app/");
  const base = appIdx > 0 ? homePath.slice(0, appIdx) : "";
  const homeDir = path.posix.dirname(homePath);

  const files: { path: string; content: string }[] = [];
  const additions: { importLine: string; tag: string }[] = [];

  for (const id of sectionIds) {
    const s = getSection(id);
    if (!s) continue;
    const filePath = base + sectionFilePath(id);
    files.push({ path: filePath, content: s.code });

    const rel = path.posix.relative(homeDir, filePath.replace(/\.tsx$/, ""));
    const spec = rel.startsWith(".") ? rel : "./" + rel;
    additions.push({
      importLine: `import ${s.importName} from "${spec}";`,
      tag: `<${s.importName} />`,
    });
  }
  return { files, additions };
}
