/**
 * Stable structural ids for JSX elements — the anchor the visual builder uses to
 * locate an element across reloads, instead of `line:col` (which shifts the
 * moment any content is added above it).
 *
 * An element's id is its CHILD-INDEX PATH from the file's JSX roots:
 *   "0"        → first root element of the file
 *   "0.2"      → that root's 3rd JSX-element child
 *   "0.2.1"    → …its 2nd JSX-element child
 *
 * Why this is stable for the builder's main operation (append a last child):
 * appending to a container adds a NEW trailing index inside that container —
 * it never renumbers existing ancestors, earlier siblings, or other subtrees.
 * So every pre-existing element keeps its id. Text/class/attr edits don't touch
 * structure either. (Deleting / moving / inserting NOT-last does shift later
 * siblings — a known limit; the builder appends.)
 *
 * The scheme is parser-independent: roots are ordered by source `start`, and
 * children by their `.children` array order — identical whether the tree came
 * from recast (stamping) or @babel/parser (locating). That's what lets the id
 * stamped into the DOM resolve back to the same node on the server.
 */

export const BUILDER_ATTR = "data-builder-id";

type JsxNode = { type: string; start?: number; children?: unknown[]; [k: string]: unknown };

const isJsx = (n: unknown): n is JsxNode =>
  !!n &&
  typeof n === "object" &&
  ((n as JsxNode).type === "JSXElement" || (n as JsxNode).type === "JSXFragment");

function jsxChildrenOf(n: JsxNode): JsxNode[] {
  return Array.isArray(n.children) ? (n.children.filter(isJsx) as JsxNode[]) : [];
}

/** Every JSXElement/JSXFragment node in the tree (unordered). */
function collectJsx(program: unknown): JsxNode[] {
  const all: JsxNode[] = [];
  const visit = (n: unknown) => {
    if (!n || typeof n !== "object") return;
    if (Array.isArray(n)) {
      for (const c of n) visit(c);
      return;
    }
    if (isJsx(n)) all.push(n);
    for (const k of Object.keys(n)) {
      if (k === "loc" || k === "tokens" || k === "comments" || k === "leadingComments" || k === "trailingComments") {
        continue;
      }
      visit((n as Record<string, unknown>)[k]);
    }
  };
  visit(program);
  return all;
}

/**
 * Map every JSX node to its stable path string. Roots (JSX nodes that aren't a
 * `.children` member of another JSX node — including JSX inside `{…}`
 * expressions) are ordered by source position; children by array order.
 */
export function assignBuilderPaths(program: unknown): Map<JsxNode, string> {
  const all = collectJsx(program);
  const childSet = new Set<JsxNode>();
  for (const n of all) for (const c of jsxChildrenOf(n)) childSet.add(c);
  const roots = all
    .filter((n) => !childSet.has(n))
    .sort((a, b) => (a.start ?? 0) - (b.start ?? 0));

  const map = new Map<JsxNode, string>();
  const descend = (n: JsxNode, path: string) => {
    map.set(n, path);
    jsxChildrenOf(n).forEach((k, i) => descend(k, path + "." + i));
  };
  roots.forEach((r, i) => descend(r, String(i)));
  return map;
}

/** Find the JSX node with the given builder path, or null. */
export function nodeForBuilderId(program: unknown, id: string): JsxNode | null {
  const map = assignBuilderPaths(program);
  for (const [node, path] of map) if (path === id) return node;
  return null;
}

/** The stamped id is `<filePath>@<path>` — the path alone ("0.2") is ambiguous
 *  across files, so we carry the source file with it. */
export function makeBuilderId(filePath: string, path: string): string {
  return `${filePath}@${path}`;
}

/** Split a stamped builder id back into its file + structural path. */
export function parseBuilderId(id: string): { filePath: string; path: string } | null {
  const at = id.lastIndexOf("@");
  if (at < 0) return null;
  return { filePath: id.slice(0, at), path: id.slice(at + 1) };
}

/** Strip our injected `data-builder-id="…"` attributes (defensive pre-commit). */
export function stripBuilderIds(source: string): string {
  return source.replace(/\s+data-builder-id=("[^"]*"|\{[^}]*\})/g, "");
}
