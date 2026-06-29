import { parse } from "@babel/parser";

/**
 * Source-level reorder/duplicate/delete of a JSX element, located by the visible
 * text it renders (the same value-matching click-to-edit uses — see ast.ts).
 *
 * The editor agent reports the selected element's normalized textContent as
 * `anchor`; we parse the file, find the *smallest* JSX element whose descendant
 * text contains that anchor, and splice its source range. Range-splicing (not
 * codegen) keeps the rest of the file byte-for-byte stable.
 *
 * ponytail: text-anchor locator. Needs a reasonably-unique anchor — text-less
 * elements (bare <img>, spacers) and duplicate strings can't be pinned. Upgrade
 * path: stamp DOM nodes with source locations at build time and locate by loc.
 */
export type ElementOp = "move-up" | "move-down" | "duplicate" | "delete";

export type AnyNode = {
  type: string;
  start: number;
  end: number;
  [k: string]: unknown;
};

const norm = (s: string) => s.replace(/\s+/g, " ").trim();

function walk(node: unknown, visit: (n: AnyNode, parent: AnyNode | null) => void, parent: AnyNode | null = null) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const c of node) walk(c, visit, parent);
    return;
  }
  const n = node as AnyNode;
  if (typeof n.type === "string" && typeof n.start === "number") {
    visit(n, parent);
    parent = n;
  }
  for (const key of Object.keys(node)) {
    if (key === "loc" || key === "leadingComments" || key === "trailingComments") continue;
    walk((node as Record<string, unknown>)[key], visit, parent);
  }
}

function textOf(node: AnyNode, source: string): string {
  let out = "";
  walk(node, (n) => {
    if (n.type === "JSXText") out += source.slice(n.start, n.end);
  });
  return norm(out);
}

/** Apply an op to the element matching `anchor`. Returns null if not found. */
export function applyElementOp(
  source: string,
  anchor: string,
  op: ElementOp,
): string | null {
  const target = norm(anchor);
  if (!target) return null;

  let ast;
  try {
    ast = parse(source, {
      sourceType: "module",
      plugins: ["typescript", "jsx"],
      errorRecovery: true,
    });
  } catch {
    return null;
  }

  // Smallest JSXElement/JSXFragment whose text contains the anchor.
  // Pass 1 (precise): smallest element whose source text contains the whole
  // anchor — works for fully-static elements.
  let best: AnyNode | null = null;
  let bestParent: AnyNode | null = null;
  let bestLen = Infinity;
  walk(ast.program, (n, parent) => {
    if (n.type !== "JSXElement" && n.type !== "JSXFragment") return;
    const t = textOf(n, source);
    if (!t.includes(target)) return;
    const len = n.end - n.start;
    if (len < bestLen) {
      best = n;
      bestParent = parent;
      bestLen = len;
    }
  });

  // Pass 2 (fallback): an element rendering dynamic content ({expr}, child
  // components) has source text that's only PART of the rendered anchor, and the
  // dynamic value may sit mid-text — so substring tests fail. Match by words:
  // the element whose every static word appears in the anchor, most words wins
  // (most specific), tiebreak on the smallest node to hit the leaf.
  if (!best) {
    const anchorWords = new Set(target.split(" ").filter(Boolean));
    let bestWords = 0;
    walk(ast.program, (n, parent) => {
      if (n.type !== "JSXElement" && n.type !== "JSXFragment") return;
      const words = textOf(n, source).split(" ").filter(Boolean);
      if (words.length === 0 || !words.every((w) => anchorWords.has(w))) return;
      const len = n.end - n.start;
      if (words.length > bestWords || (words.length === bestWords && len < bestLen)) {
        best = n;
        bestParent = parent;
        bestWords = words.length;
        bestLen = len;
      }
    });
  }

  if (!best) return null;
  const node = best as AnyNode;

  if (op === "delete") {
    return spliceOut(source, node);
  }
  if (op === "duplicate") {
    const indent = lineIndent(source, node.start);
    const text = source.slice(node.start, node.end);
    return source.slice(0, node.end) + "\n" + indent + text + source.slice(node.end);
  }

  // move-up / move-down: swap with the adjacent JSX sibling.
  const siblings = jsxChildren(bestParent);
  const idx = siblings.findIndex((s) => s.start === node.start && s.end === node.end);
  if (idx === -1) return null;
  const swapWith = op === "move-up" ? siblings[idx - 1] : siblings[idx + 1];
  if (!swapWith) return null;
  return swapRanges(source, swapWith, node);
}

/** Direct JSX-element children of a JSXElement/JSXFragment, in source order. */
export function jsxChildren(parent: AnyNode | null): AnyNode[] {
  if (!parent) return [];
  const children = (parent as Record<string, unknown>).children;
  if (!Array.isArray(children)) return [];
  return (children as AnyNode[])
    .filter((c) => c.type === "JSXElement" || c.type === "JSXFragment")
    .sort((a, b) => a.start - b.start);
}

export function lineIndent(source: string, pos: number): string {
  const lineStart = source.lastIndexOf("\n", pos - 1) + 1;
  const m = /^[ \t]*/.exec(source.slice(lineStart, pos));
  return m ? m[0] : "";
}

export function spliceOut(source: string, node: AnyNode): string {
  // Remove the node plus its leading indentation and one trailing newline.
  const lineStart = source.lastIndexOf("\n", node.start - 1) + 1;
  const lead = source.slice(lineStart, node.start).trim() === "" ? lineStart : node.start;
  let end = node.end;
  if (source[end] === "\n") end += 1;
  return source.slice(0, lead) + source.slice(end);
}

/** Swap two non-overlapping source ranges (a before b). */
export function swapRanges(source: string, a: AnyNode, b: AnyNode): string {
  const first = a.start < b.start ? a : b;
  const second = a.start < b.start ? b : a;
  return (
    source.slice(0, first.start) +
    source.slice(second.start, second.end) +
    source.slice(first.end, second.start) +
    source.slice(first.start, first.end) +
    source.slice(second.end)
  );
}

/** Self-check: `npx tsx src/lib/editor/element-ops.ts`. */
export function __elementOpDemo(): void {
  const src = [
    `export default function Home() {`,
    `  return (`,
    `    <main>`,
    `      <section>One alpha</section>`,
    `      <section>Two beta</section>`,
    `    </main>`,
    `  );`,
    `}`,
  ].join("\n");

  const del = applyElementOp(src, "One alpha", "delete")!;
  console.assert(!del.includes("One alpha"), "delete failed");
  console.assert(del.includes("Two beta"), "delete removed wrong node");

  const dup = applyElementOp(src, "Two beta", "duplicate")!;
  console.assert((dup.match(/Two beta/g) || []).length === 2, "duplicate failed");

  const up = applyElementOp(src, "Two beta", "move-up")!;
  console.assert(
    up.indexOf("Two beta") < up.indexOf("One alpha"),
    "move-up failed",
  );

  // Fallback: element with dynamic content — rendered anchor ⊋ source text.
  const dyn = [
    `export default function P() {`,
    `  const name = "World";`,
    `  return (<main><h1>Hello {name} today</h1><p>Keep me</p></main>);`,
    `}`,
  ].join("\n");
  const delDyn = applyElementOp(dyn, "Hello World today", "delete")!;
  console.assert(delDyn != null, "dynamic-anchor delete not located");
  console.assert(!delDyn.includes("Hello "), "dynamic delete removed wrong node");
  console.assert(delDyn.includes("Keep me"), "dynamic delete clobbered sibling");

  console.log("element-ops self-check OK\n--- move-up ---\n" + up);
}

if (process.argv[1] && /element-ops\.ts$/.test(process.argv[1])) __elementOpDemo();
