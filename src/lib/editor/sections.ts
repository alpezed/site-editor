import path from "node:path";
import { getSection } from "@/lib/sections/catalog";
import type { ProjectMetadata } from "@/lib/import/component-scanner";
import {
  type SectionInstance,
  sectionImportName,
  sectionInstancePath,
} from "@/lib/editor/types";

/** The route file that added sections get appended to (the site's home page). */
export function homeRouteFile(metadata: ProjectMetadata | null | undefined): string {
  // Must be a `page`, never a `layout`: the scanner records app/layout.tsx as a
  // "/" route too, but sections belong on the page (a layout wraps every route),
  // and the sandbox injects the editor agent <script> into layout.tsx — writing
  // a section into layout would wipe that script and kill edit mode.
  const isHome = (p: string) => p === "/" || p === "";
  const home =
    metadata?.routes?.find((r) => r.kind === "page" && isHome(r.routePath)) ??
    metadata?.routes?.find((r) => r.kind === "page");
  return home?.filePath ?? "app/page.tsx";
}

/**
 * Pure planning step for staged sections: given the ordered section instances
 * and the home route path, return the per-instance component files to write
 * plus the import/tag pairs to splice into the home file (via applySectionAdds).
 *
 * Each instance gets its OWN file + import (keyed by instance.key) so two copies
 * of the same catalog section are independent. The tag is wrapped in a
 * `<div data-section-key=…>` so the rendered DOM carries the key — that's how
 * the editor maps a clicked/deleted element back to its instance after reload.
 *
 * Section files are placed under the same base as the home route (`src/` or
 * repo root) so a relative import always resolves. Unknown ids are skipped.
 */
export function planSectionAdditions(
  instances: SectionInstance[],
  homePath: string,
): {
  files: { path: string; content: string }[];
  additions: { importLine: string; tag: string; anchor?: string }[];
} {
  // base = the segment before "app/" — "src/" for src/app/page.tsx, "" for app/page.tsx.
  const appIdx = homePath.indexOf("app/");
  const base = appIdx > 0 ? homePath.slice(0, appIdx) : "";
  const homeDir = path.posix.dirname(homePath);

  const files: { path: string; content: string }[] = [];
  const additions: { importLine: string; tag: string; anchor?: string }[] = [];

  for (const inst of instances) {
    const s = getSection(inst.id);
    if (!s) continue;
    const filePath = base + sectionInstancePath(inst.key);
    const importName = sectionImportName(inst.key);
    files.push({ path: filePath, content: s.code });

    const rel = path.posix.relative(homeDir, filePath.replace(/\.tsx$/, ""));
    const spec = rel.startsWith(".") ? rel : "./" + rel;
    additions.push({
      importLine: `import ${importName} from "${spec}";`,
      tag: `<div data-section-key="${inst.key}"><${importName} /></div>`,
      anchor: inst.afterAnchor,
    });
  }
  return { files, additions };
}

/**
 * Resolve the home file that actually exists in the repo and plan the section
 * writes against it. `homeRouteFile` relies on scanned metadata, which can be
 * stale/missing or point at the wrong `src/` base — so fall back to the two
 * conventional home paths and use the first that loads. Returns null if none
 * load (caller then skips, rather than writing an orphan component file whose
 * tag was never appended to any rendered page).
 */
export async function planSectionsForHome(
  metadata: ProjectMetadata | null | undefined,
  instances: SectionInstance[],
  load: (p: string) => Promise<string | undefined>,
): Promise<{
  homePath: string;
  homeSource: string;
  files: { path: string; content: string }[];
  additions: { importLine: string; tag: string }[];
} | null> {
  const candidates = [...new Set([
    homeRouteFile(metadata),
    "src/app/page.tsx",
    "app/page.tsx",
  ])];
  for (const homePath of candidates) {
    const homeSource = await load(homePath);
    if (homeSource == null) continue;
    const { files, additions } = planSectionAdditions(instances, homePath);
    return { homePath, homeSource, files, additions };
  }
  return null;
}
