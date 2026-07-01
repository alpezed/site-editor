import path from "node:path";
import type { ProjectMetadata } from "@/lib/import/component-scanner";
import { getSection } from "@/lib/sections/catalog";
import { getComponentSource } from "@/lib/sections/catalog-source";
import { appendChildByBuilderId } from "@/lib/editor/node-edit";
import { parseBuilderId } from "@/lib/editor/builder-path";
import { type SectionInstance, sectionInstancePath } from "@/lib/editor/types";

/** The route file that added sections get appended to (the site's home page). */
export function homeRouteFile(metadata: ProjectMetadata | null | undefined): string {
  // Must be a `page`, never a `layout`: the scanner records app/layout.tsx as a
  // "/" route too, but sections belong on the page (a layout wraps every route),
  // and the sandbox injects the editor agent <script> into layout.tsx — writing
  // a section into layout would wipe that script and kill edit mode.
  const isHome = (p: string) => p === "/" || p === "";
  const pages = (metadata?.routes ?? []).filter(
    (r) => r.kind === "page" && !isLayoutFile(r.filePath),
  );
  const home = pages.find((r) => isHome(r.routePath)) ?? pages[0];
  return home?.filePath ?? "app/page.tsx";
}

/** A layout file wraps every route and holds the injected editor <script> — a
 *  section must never be written into one (see homeRouteFile). */
function isLayoutFile(p: string): boolean {
  return /(?:^|\/)layout\.(?:tsx|jsx|ts|js)$/.test(p);
}

/** Remove editor-managed section imports (from components/site-editor-sections/…)
 *  and their `<Name />` tags. Used to self-heal a layout that an earlier bug
 *  polluted — those imports/tags are ours, so stripping them is safe. */
export function stripSectionUsages(source: string): string {
  const importRe =
    /^[ \t]*import\s+(\w+)\s+from\s+["'][^"']*site-editor-sections\/[^"']*["'];?[ \t]*\r?\n?/gm;
  const names: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = importRe.exec(source))) names.push(m[1]);
  let out = source.replace(importRe, "");
  for (const n of names) {
    out = out.replace(new RegExp(`\\s*<${n}\\s*/>`, "g"), "");
  }
  return out;
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
    const candidates = [
      ...new Set([homeRouteFile(metadata), "src/app/page.tsx", "app/page.tsx"]),
    ].filter((c) => !isLayoutFile(c));
    for (const c of candidates) {
      if ((edited.get(c) ?? (await load(c))) != null) return (homePath = c);
    }
    return (homePath = null);
  };

  // Self-heal: an earlier bug wrote sections into the layout (which wraps every
  // route). Strip our imports/tags from the home dir's layout so a re-publish
  // removes the committed pollution instead of carrying it forever.
  const home = await resolveHome();
  if (home) {
    const dir = path.posix.dirname(home);
    for (const lp of [`${dir}/layout.tsx`, `${dir}/layout.jsx`]) {
      const cur = edited.get(lp) ?? (await load(lp));
      if (cur == null) continue;
      const cleaned = stripSectionUsages(cur);
      if (cleaned !== cur) edited.set(lp, cleaned);
    }
  }

  for (const inst of instances) {
    // Validate against the catalog + load the shared component source (server fs).
    if (!getSection(inst.name)) continue;
    const source = getComponentSource(inst.name);
    if (source == null) continue;

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
    // Never write into a layout (its <body>/root is what the agent resolves to
    // when the selection's nearest stamped container lives in layout.tsx). Redirect
    // to the page root so the element lands on the page, not around every route.
    if (filePath && isLayoutFile(filePath)) {
      filePath = await resolveHome();
      builderPath = null;
    }
    if (!filePath) continue;

    const base = filePath.startsWith("src/") ? "src/" : "";
    // Path + import name are keyed by the component NAME (not the placement key),
    // so N placements write the same file once and insertImportLine dedupes the
    // import — only the `<Name />` tag is added per placement. Kills UUID bloat.
    const componentPath = base + sectionInstancePath(inst.name);
    const importName = inst.name;
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
    edited.set(componentPath, source);
  }
}

/** Self-check: `npx tsx src/lib/editor/sections.ts`. Proves a nested add lands
 *  inside its target container (not the page root), re-applying is deterministic,
 *  and two placements of the same component share ONE file + import (dedup fix). */
async function __sectionsDemo(): Promise<void> {
  const { stampSource } = await import("@/lib/editor/stamp");
  const { getComponentSource } = await import("@/lib/sections/catalog-source");
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

  const apply = async (instances: SectionInstance[]) => {
    const edited = new Map<string, string>();
    await applySections(
      instances,
      edited,
      async (p) => (p === "app/page.tsx" ? page : undefined),
      meta,
    );
    return edited;
  };

  const edited = await apply([{ key: "k1", name: "TextBlock", builderId }]);
  const out = edited.get("app/page.tsx")!;
  const tagAt = out.indexOf("<TextBlock");
  assert(tagAt > out.indexOf("<h1>"), "added element not after existing child");
  assert(tagAt < out.indexOf("</section>"), "added element escaped the <section> (went to root)");
  // Component file is written by NAME and equals the shared source on disk.
  const compPath = "components/site-editor-sections/TextBlock.tsx";
  assert(edited.get(compPath) === getComponentSource("TextBlock"), "component file not the shared source");
  // Reload determinism: applying again from the same clean source is identical.
  assert((await apply([{ key: "k1", name: "TextBlock", builderId }])).get("app/page.tsx") === out, "placement not deterministic across reloads");

  // Dedup: two placements of the SAME component → one file, one import, two tags.
  const dup = await apply([
    { key: "k1", name: "TextBlock", builderId },
    { key: "k2", name: "TextBlock", builderId },
  ]);
  const dupPage = dup.get("app/page.tsx")!;
  assert([...dup.keys()].filter((k) => k.endsWith("TextBlock.tsx")).length === 1, "duplicate component files written");
  assert((dupPage.match(/import TextBlock from/g) || []).length === 1, "import not deduped");
  assert((dupPage.match(/<TextBlock \/>/g) || []).length === 2, "expected two placement tags");

  // Layout guard: a builderId pointing at layout.tsx redirects to the page root,
  // never writing into the layout (which wraps every route + holds the agent script).
  const layoutAdd = await apply([
    { key: "k1", name: "TextBlock", builderId: "app/layout.tsx@0.0" },
  ]);
  assert(![...layoutAdd.keys()].some(isLayoutFile), "section wrongly written into a layout file");
  assert(layoutAdd.get("app/page.tsx")!.includes("<TextBlock />"), "layout add did not fall back to the page");

  // stripSectionUsages removes editor-managed imports + tags, keeps the rest.
  const dirtyLayout = [
    `import ImageBlock from "../components/site-editor-sections/ImageBlock";`,
    `import Keep from "./keep";`,
    `export default function RootLayout({ children }) {`,
    `  return (<body>{children}<ImageBlock /><Keep /></body>);`,
    `}`,
  ].join("\n");
  const healed = stripSectionUsages(dirtyLayout);
  assert(!healed.includes("ImageBlock"), "section import/tag not stripped from layout");
  assert(healed.includes("<Keep />") && healed.includes('import Keep'), "stripSectionUsages clobbered non-section code");
  console.log("sections self-check OK");
}

if (process.argv[1] && /sections\.ts$/.test(process.argv[1])) void __sectionsDemo();
