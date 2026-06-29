/**
 * Static project scanner. Given the repo file list and selected file contents,
 * extracts routes, components, editable fields and assets to build the editor
 * metadata. This is deliberately regex/heuristic based (no full TS parse) so it
 * can run cheaply during import; the visual editor refines per-file with a real
 * AST on demand (see lib/editor/ast.ts).
 */

export interface EditableField {
  name: string;
  type: "text" | "textarea" | "image" | "number" | "boolean" | "select";
}

export interface ScannedComponent {
  name: string;
  filePath: string;
  /** Fields exposed via `export const editor = {...}`. */
  editableFields: EditableField[];
  props: string[];
}

export interface ScannedRoute {
  routePath: string;
  filePath: string;
  kind: "page" | "layout";
}

export interface ProjectMetadata {
  routes: ScannedRoute[];
  components: ScannedComponent[];
  assets: string[];
  scannedAt: string;
}

const CODE_EXT = /\.(tsx|jsx|ts|js)$/;
const ASSET_EXT = /\.(png|jpe?g|gif|svg|webp|avif|ico|mp4|webm)$/i;

/** Map a Next.js app-router file path to its route. */
function appRoute(filePath: string): ScannedRoute | null {
  const m = filePath.match(/^(?:src\/)?app\/(.*)\/(page|layout)\.(tsx|jsx)$/);
  if (m) {
    const segments = m[1]
      .split("/")
      .filter((s) => s && !(s.startsWith("(") && s.endsWith(")")));
    return {
      routePath: "/" + segments.join("/"),
      filePath,
      kind: m[2] as "page" | "layout",
    };
  }
  const root = filePath.match(/^(?:src\/)?app\/(page|layout)\.(tsx|jsx)$/);
  if (root) {
    return { routePath: "/", filePath, kind: root[1] as "page" | "layout" };
  }
  // pages-router page.
  const pages = filePath.match(/^(?:src\/)?pages\/(.*)\.(tsx|jsx)$/);
  if (pages && !filePath.includes("_app") && !filePath.includes("_document")) {
    const route = "/" + pages[1].replace(/index$/, "").replace(/\/$/, "");
    return { routePath: route || "/", filePath, kind: "page" };
  }
  return null;
}

/** Parse `export const editor = { field: { type: "..." } }` blocks. */
export function parseEditableFields(source: string): EditableField[] {
  const match = source.match(
    /export\s+const\s+editor\s*=\s*\{([\s\S]*?)\n\}/,
  );
  if (!match) return [];

  const body = match[1];
  const fields: EditableField[] = [];
  const fieldRe = /(["'\w]+)\s*:\s*\{[^}]*?type\s*:\s*["'](\w+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = fieldRe.exec(body))) {
    const name = m[1].replace(/["']/g, "");
    const type = m[2] as EditableField["type"];
    fields.push({ name, type });
  }
  return fields;
}

function componentName(filePath: string): string {
  const base = filePath.split("/").pop() ?? filePath;
  return base.replace(CODE_EXT, "");
}

function parseProps(source: string): string[] {
  // Best-effort: capture a destructured props object on the default export fn.
  const m = source.match(/function\s+\w+\s*\(\s*\{([^}]*)\}/);
  if (!m) return [];
  return m[1]
    .split(",")
    .map((s) => s.split(":")[0].trim())
    .filter(Boolean);
}

export function scanProject(
  filePaths: string[],
  contents: Record<string, string>,
): ProjectMetadata {
  const routes: ScannedRoute[] = [];
  const components: ScannedComponent[] = [];
  const assets: string[] = [];

  for (const path of filePaths) {
    if (ASSET_EXT.test(path)) {
      assets.push(path);
      continue;
    }
    if (!CODE_EXT.test(path)) continue;

    const route = appRoute(path);
    if (route) routes.push(route);

    const source = contents[path];
    if (source && /export\s+const\s+editor\s*=/.test(source)) {
      components.push({
        name: componentName(path),
        filePath: path,
        editableFields: parseEditableFields(source),
        props: parseProps(source),
      });
    }
  }

  return {
    routes,
    components,
    assets,
    scannedAt: new Date().toISOString(),
  };
}
