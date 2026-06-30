import path from "node:path";
import type { ProjectMetadata } from "@/lib/import/component-scanner";
import { getSection } from "@/lib/sections/catalog";
import { appendChildByBuilderId } from "@/lib/editor/node-edit";
import { parseBuilderId } from "@/lib/editor/builder-path";
import {
  type SectionInstance,
  sectionInstancePath,
  sectionImportName,
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
 * Apply staged section instances by writing each one's component file and
 * inserting `<Section_key />` as the LAST CHILD of its target container —
 * located by the instance's stable `builderId` (or the page root when absent).
 * Deterministic: the same builder id reproduces the same placement on every
 * sync/save, so a reload renders exactly where the element was dropped.
 *
 * Mutates `edited` in place (both the touched route files and the new component
 * files land there) so the caller's existing write/commit set picks them up.
 * Applied LAST — on top of field edits / overrides — so an added element is
 * never clobbered. Instances whose target can't be located are skipped.
 */
export async function applySections(
  instances: SectionInstance[],
  edited: Map<string, string>,
  load: (p: string) => Promise<string | undefined>,
  metadata: ProjectMetadata | null | undefined,
): Promise<void> {
  if (instances.length === 0) return;

  // Resolve (and cache) the home file once, for instances added with no
  // container selected (builderId absent → page root).
  let homePath: string | null | undefined;
  const resolveHome = async (): Promise<string | null> => {
    if (homePath !== undefined) return homePath;
    const candidates = [...new Set([homeRouteFile(metadata), "src/app/page.tsx", "app/page.tsx"])];
    for (const c of candidates) {
      if ((edited.get(c) ?? (await load(c))) != null) return (homePath = c);
    }
    return (homePath = null);
  };

  for (const inst of instances) {
    const s = getSection(inst.id);
    if (!s) continue;

    let filePath: string | null;
    let builderPath: string | null;
    if (inst.builderId) {
      const parsed = parseBuilderId(inst.builderId);
      if (!parsed) continue;
      filePath = parsed.filePath;
      builderPath = parsed.path;
    } else {
      filePath = await resolveHome();
      builderPath = null;
    }
    if (!filePath) continue;

    const base = filePath.startsWith("src/") ? "src/" : "";
    const componentPath = base + sectionInstancePath(inst.key);
    const importName = sectionImportName(inst.key);
    const rel = path.posix.relative(
      path.posix.dirname(filePath),
      componentPath.replace(/\.tsx$/, ""),
    );
    const spec = rel.startsWith(".") ? rel : "./" + rel;

    const current = edited.get(filePath) ?? (await load(filePath));
    if (current == null) continue;
    const next = appendChildByBuilderId(
      current,
      builderPath,
      `<${importName} />`,
      `import ${importName} from "${spec}";`,
    );
    if (next == null) continue;

    edited.set(filePath, next);
    edited.set(componentPath, s.code);
  }
}

/** Self-check: `npx tsx src/lib/editor/sections.ts`. Proves a nested add lands
 *  inside its target container (not the page root) and that re-applying from the
 *  clean source — what every reload/sync does — reproduces the SAME placement. */
async function __sectionsDemo(): Promise<void> {
  const { stampSource } = await import("@/lib/editor/stamp");
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
  };
  const page = [
    `export default function Home() {`,
    `  return (`,
    `    <main>`,
    `      <section className="features">`,
    `        <h1>Title</h1>`,
    `      </section>`,
    `    </main>`,
    `  );`,
    `}`,
  ].join("\n");
  // The <section> is the nearest container of the (leaf) <h1> the user clicks.
  const stamped = stampSource("app/page.tsx", page);
  const m = /<section\b[^>]*?data-builder-id="([^"]+)"/s.exec(stamped);
  assert(m != null, "section not stamped with builder-id");
  const builderId = m![1];
  const meta = {
    routes: [{ kind: "page", routePath: "/", filePath: "app/page.tsx" }],
  } as unknown as ProjectMetadata;

  const apply = async () => {
    const edited = new Map<string, string>();
    await applySections(
      [{ key: "k1", id: "el-text", builderId }],
      edited,
      async (p) => (p === "app/page.tsx" ? page : undefined),
      meta,
    );
    return edited.get("app/page.tsx")!;
  };

  const out = await apply();
  const tagAt = out.indexOf("<Section_k1");
  assert(tagAt > out.indexOf("<h1>"), "added element not after existing child");
  assert(tagAt < out.indexOf("</section>"), "added element escaped the <section> (went to root)");
  // Reload determinism: applying again from the same clean source is identical.
  assert((await apply()) === out, "placement not deterministic across reloads");
  console.log("sections self-check OK");
}

if (process.argv[1] && /sections\.ts$/.test(process.argv[1])) void __sectionsDemo();
