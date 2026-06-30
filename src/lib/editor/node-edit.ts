import { parse } from "@babel/parser";
import {
  type AnyNode,
  type ElementOp,
  jsxChildren,
  lineIndent,
  spliceOut,
  swapRanges,
} from "@/lib/editor/element-ops";
import { mergeClasses, type TwGroup } from "@/lib/editor/tailwind";
import { nodeForBuilderId, assignBuilderPaths } from "@/lib/editor/builder-path";

/**
 * Loc-based JSX node edits for the visual inspector. The element is located by
 * the source position carried in its `data-sx-id` stamp (line:col of the
 * opening element — see stamp.ts), never by text anchor. Edits splice the
 * node's source range (offsets from Babel), so untouched code stays
 * byte-for-byte stable. The result is re-parsed; if it doesn't parse we return
 * null and the caller keeps the prior source (never emit broken code).
 */

export type Patch =
  | { kind: "text"; value: string }
  | { kind: "classes"; group: TwGroup; token: string | null }
  | { kind: "attr"; name: string; value: string }
  | { kind: "op"; op: ElementOp }
  // Insert `tag` as the located element's LAST CHILD (before its closing tag),
  // optionally adding `importLine` if not already present. This is how the site
  // builder adds an element/component inside a container — deterministic by loc,
  // no text anchors. See appendChildToRoot for the no-selection (page root) case.
  | { kind: "insertChild"; tag: string; importLine?: string };

export interface Loc {
  line: number;
  column: number;
}

function parseSafe(source: string) {
  try {
    return parse(source, {
      sourceType: "module",
      plugins: ["typescript", "jsx"],
      errorRecovery: true,
    });
  } catch {
    return null;
  }
}

/** Find the JSXElement whose opening tag starts at `loc`, plus its parent. */
function locate(
  ast: ReturnType<typeof parse>,
  loc: Loc,
): { el: AnyNode; parent: AnyNode | null } | null {
  let found: { el: AnyNode; parent: AnyNode | null } | null = null;
  const walk = (node: unknown, parent: AnyNode | null) => {
    if (found || !node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const c of node) walk(c, parent);
      return;
    }
    const n = node as AnyNode;
    let nextParent = parent;
    if (n.type === "JSXElement") {
      const open = n.openingElement as AnyNode | undefined;
      const start = (open?.loc as { start?: Loc } | undefined)?.start;
      if (start && start.line === loc.line && start.column === loc.column) {
        found = { el: n, parent };
        return;
      }
      nextParent = n;
    } else if (n.type === "JSXFragment") {
      nextParent = n;
    }
    for (const key of Object.keys(n)) {
      if (key === "loc" || key === "leadingComments" || key === "trailingComments") continue;
      walk((n as Record<string, unknown>)[key], nextParent);
    }
  };
  walk((ast as { program: unknown }).program, null);
  return found;
}

function escapeJsxText(v: string): string {
  return v
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/[{}]/g, (c) => (c === "{" ? "&#123;" : "&#125;"));
}

function findAttr(open: AnyNode, name: string): AnyNode | null {
  const attrs = (open.attributes as AnyNode[]) ?? [];
  return (
    attrs.find(
      (a) =>
        a.type === "JSXAttribute" &&
        (a.name as AnyNode | undefined)?.name === name,
    ) ?? null
  );
}

/** Current string value of a JSX attribute (StringLiteral or {"..."}). null if
 *  the attribute is a non-string expression we shouldn't touch. */
function attrStringValue(attr: AnyNode): { value: string; range: [number, number] } | null {
  const v = attr.value as AnyNode | null;
  if (!v) return { value: "", range: [attr.end, attr.end] }; // bare attr (boolean)
  if (v.type === "StringLiteral") {
    return { value: v.value as string, range: [v.start + 1, v.end - 1] };
  }
  if (v.type === "JSXExpressionContainer") {
    const expr = v.expression as AnyNode;
    if (expr.type === "StringLiteral") {
      return { value: expr.value as string, range: [expr.start + 1, expr.end - 1] };
    }
  }
  return null; // dynamic expression — don't rewrite
}

function setAttrValue(
  source: string,
  open: AnyNode,
  name: string,
  value: string,
): string | null {
  const attr = findAttr(open, name);
  const escaped = value.replace(/"/g, "&quot;");
  if (attr) {
    const cur = attrStringValue(attr);
    if (!cur) return null; // dynamic value — bail
    return source.slice(0, cur.range[0]) + escaped + source.slice(cur.range[1]);
  }
  // Insert ` name="value"` right after the tag name.
  const nameNode = open.name as AnyNode;
  const at = nameNode.end;
  return source.slice(0, at) + ` ${name}="${escaped}"` + source.slice(at);
}

/** Apply a patch to the element at `loc`. Returns null if not found, the edit
 *  can't be expressed safely, or the result fails to re-parse. */
export function applyNodeEdit(
  source: string,
  loc: Loc,
  patch: Patch,
): string | null {
  const ast = parseSafe(source);
  if (!ast) return null;
  const hit = locate(ast, loc);
  if (!hit) return null;
  const { el, parent } = hit;
  const open = el.openingElement as AnyNode;

  let out: string | null = null;

  if (patch.kind === "op") {
    if (patch.op === "delete") {
      out = spliceOut(source, el);
    } else if (patch.op === "duplicate") {
      const indent = lineIndent(source, el.start);
      const text = source.slice(el.start, el.end);
      out = source.slice(0, el.end) + "\n" + indent + text + source.slice(el.end);
    } else {
      const siblings = jsxChildren(parent);
      const idx = siblings.findIndex((s) => s.start === el.start && s.end === el.end);
      const swapWith = patch.op === "move-up" ? siblings[idx - 1] : siblings[idx + 1];
      if (idx === -1 || !swapWith) return null;
      out = swapRanges(source, swapWith, el);
    }
  } else if (patch.kind === "classes") {
    const attr = findAttr(open, "className");
    const cur = attr ? attrStringValue(attr) : { value: "", range: null as [number, number] | null };
    if (attr && !cur) return null; // dynamic className — can't merge safely
    const merged = mergeClasses(cur?.value ?? "", patch.group, patch.token);
    if (attr && cur?.range) {
      out = source.slice(0, cur.range[0]) + merged + source.slice(cur.range[1]);
    } else {
      const at = (open.name as AnyNode).end;
      out = source.slice(0, at) + ` className="${merged}"` + source.slice(at);
    }
  } else if (patch.kind === "attr") {
    out = setAttrValue(source, open, patch.name, patch.value);
  } else if (patch.kind === "text") {
    const close = el.closingElement as AnyNode | null;
    if (!close) return null; // self-closing: no text to set
    out =
      source.slice(0, open.end) +
      escapeJsxText(patch.value) +
      source.slice(close.start);
  } else if (patch.kind === "insertChild") {
    out = insertBeforeClose(source, el, patch.tag);
    if (out != null && patch.importLine) out = insertImportLine(out, patch.importLine);
  }

  if (out == null) return null;
  // Never emit source that doesn't parse.
  return parseSafe(out) ? out : null;
}

/** Splice `tag` in as the element's last child — right before its closing tag,
 *  reusing the close tag's indentation. null if the element is self-closing. */
function insertBeforeClose(source: string, el: AnyNode, tag: string): string | null {
  const close = el.closingElement as AnyNode | null;
  if (!close) return null;
  const indent = lineIndent(source, close.start);
  return source.slice(0, close.start) + tag + "\n" + indent + source.slice(close.start);
}

/** Add `importLine` after the last top-level import, unless already present. */
function insertImportLine(source: string, importLine: string): string {
  if (source.includes(importLine.trim())) return source;
  const importRe = /^[ \t]*import\b.*$/gm;
  let lastEnd = -1;
  for (const m of source.matchAll(importRe)) lastEnd = m.index! + m[0].length;
  if (lastEnd >= 0) {
    return source.slice(0, lastEnd) + "\n" + importLine + source.slice(lastEnd);
  }
  return importLine + "\n" + source;
}

/**
 * Append `tag` as the last child of the element with the given stable builder
 * path (see builder-path.ts), adding `importLine`. When `builderId` is null (no
 * element selected) it appends at the file's JSX root. Returns null if the
 * target can't be found, is self-closing, or the result won't parse.
 *
 * This is the builder's insertion primitive: placement is a stable structural
 * path, so the same call reproduces the same placement on every reload.
 */
export function appendChildByBuilderId(
  source: string,
  builderId: string | null,
  tag: string,
  importLine?: string,
): string | null {
  if (builderId == null) return appendChildToRoot(source, tag, importLine);
  const ast = parseSafe(source);
  if (!ast) return null;
  const el = nodeForBuilderId((ast as { program: unknown }).program, builderId) as AnyNode | null;
  if (!el) return null;
  let out = insertBeforeClose(source, el, tag);
  if (out == null) return null;
  if (importLine) out = insertImportLine(out, importLine);
  return parseSafe(out) ? out : null;
}

/**
 * Append `tag` as the last child of the file's ROOT JSX element (the outermost
 * one — the page's returned tree), for adds with no element selected. Adds
 * `importLine` too. Returns null if there's no JSX root or the result won't
 * parse. Deterministic file manipulation, same as a loc-based insertChild.
 */
export function appendChildToRoot(
  source: string,
  tag: string,
  importLine?: string,
): string | null {
  const ast = parseSafe(source);
  if (!ast) return null;
  // Outermost JSXElement = the one with the widest span.
  let root: AnyNode | null = null;
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const c of node) walk(c);
      return;
    }
    const n = node as AnyNode;
    if (n.type === "JSXElement") {
      if (!root || n.end - n.start > root.end - root.start) root = n;
    }
    for (const key of Object.keys(n)) {
      if (key === "loc" || key === "leadingComments" || key === "trailingComments") continue;
      walk((n as Record<string, unknown>)[key]);
    }
  };
  walk((ast as { program: unknown }).program);
  if (!root) return null;
  let out = insertBeforeClose(source, root, tag);
  if (out == null) return null;
  if (importLine) out = insertImportLine(out, importLine);
  return parseSafe(out) ? out : null;
}

/** Self-check: `npx tsx src/lib/editor/node-edit.ts`. */
function demo(): void {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
  };
  const src = [
    `export default function Home() {`,
    `  return (`,
    `    <main className="p-2">`,
    `      <h1 className="text-lg">Hello</h1>`,
    `      <p>Keep</p>`,
    `    </main>`,
    `  );`,
    `}`,
  ].join("\n");

  // Locate <main> at line 3 col 4 (0-based col), set padding.
  const mainLoc = { line: 3, column: 4 };
  const padded = applyNodeEdit(src, mainLoc, { kind: "classes", group: "padding", token: "p-8" })!;
  assert(padded.includes('className="p-8"'), "padding not replaced: " + padded);

  // h1 at line 4 col 6 — change text.
  const h1Loc = { line: 4, column: 6 };
  const retext = applyNodeEdit(src, h1Loc, { kind: "text", value: "Hi there" })!;
  assert(retext.includes(">Hi there</h1>"), "text not set: " + retext);
  assert(retext.includes("Keep"), "clobbered sibling");

  // h1 color (new arbitrary token, keeps text-lg).
  const colored = applyNodeEdit(src, h1Loc, {
    kind: "classes",
    group: "textColor",
    token: "text-[#188bdb]",
  })!;
  assert(colored.includes("text-lg") && colored.includes("text-[#188bdb]"), "color merge: " + colored);

  // p at line 5 col 6 — add className where none exists.
  const pLoc = { line: 5, column: 6 };
  const bg = applyNodeEdit(src, pLoc, { kind: "classes", group: "bgColor", token: "bg-[#fff]" })!;
  assert(bg.includes('<p className="bg-[#fff]">'), "insert className: " + bg);

  // delete p.
  const del = applyNodeEdit(src, pLoc, { kind: "op", op: "delete" })!;
  assert(!del.includes("Keep"), "delete failed");

  // bad loc → null.
  assert(applyNodeEdit(src, { line: 99, column: 0 }, { kind: "text", value: "x" }) === null, "miss should be null");

  // insertChild: new component lands as <main>'s last child, before </main>,
  // after the existing <p>, and the import is added once.
  const inserted = applyNodeEdit(src, mainLoc, {
    kind: "insertChild",
    tag: "<Hero />",
    importLine: `import Hero from "./hero";`,
  })!;
  assert(inserted != null, "insertChild returned null");
  assert(
    inserted.indexOf("<Hero />") > inserted.indexOf("<p>") &&
      inserted.indexOf("<Hero />") < inserted.indexOf("</main>"),
    "insertChild not placed as last child: " + inserted,
  );
  assert((inserted.match(/import Hero from/g) || []).length === 1, "import not added once");

  // self-closing target can't take a child → null.
  const sc = `export default () => <img src="x" />;`;
  assert(
    applyNodeEdit(sc, { line: 1, column: 19 }, { kind: "insertChild", tag: "<b/>" }) === null,
    "self-closing insertChild should be null",
  );

  // appendChildToRoot: no selection → lands inside the root <main>.
  const atRoot = appendChildToRoot(src, "<Foot />", `import Foot from "./foot";`)!;
  assert(
    atRoot.indexOf("<Foot />") < atRoot.indexOf("</main>") &&
      atRoot.includes(`import Foot from "./foot";`),
    "appendChildToRoot misplaced: " + atRoot,
  );
  // Re-adding the same import doesn't duplicate it (loc-independent path).
  const atRoot2 = appendChildToRoot(atRoot, "<Foot />", `import Foot from "./foot";`)!;
  assert((atRoot2.match(/import Foot from/g) || []).length === 1, "import duplicated");

  // ── Stable builder-id placement ──────────────────────────────────────────
  const page = [
    `export default function P() {`,
    `  return (`,
    `    <main>`,
    `      <header><h1>Hi</h1></header>`,
    `      <section><p>One</p></section>`,
    `    </main>`,
    `  );`,
    `}`,
  ].join("\n");
  const idOf = (src: string, tag: string): string => {
    const ast = parseSafe(src)!;
    const map = assignBuilderPaths((ast as { program: unknown }).program);
    for (const [n, path] of map) {
      const open = (n as AnyNode).openingElement as AnyNode | undefined;
      const name = open && ((open as Record<string, unknown>).name as AnyNode | undefined);
      if (name && (name as Record<string, unknown>).name === tag) return path;
    }
    throw new Error("tag not found: " + tag);
  };
  const sectionId = idOf(page, "section");

  // Insert inside <section> by its builder id → lands before </section>.
  const added = appendChildByBuilderId(page, sectionId, "<Promo />", `import Promo from "./promo";`)!;
  assert(added != null, "builder insert returned null");
  assert(
    added.indexOf("<Promo />") > added.indexOf("<p>One</p>") &&
      added.indexOf("<Promo />") < added.indexOf("</section>"),
    "builder insert not inside <section>: " + added,
  );

  // STABILITY: appending a child to <header> must NOT change <section>'s id.
  const headerId = idOf(page, "header");
  const afterHeaderAdd = appendChildByBuilderId(page, headerId, "<X />")!;
  assert(idOf(afterHeaderAdd, "section") === sectionId, "section id drifted after a sibling add");

  // null id → appends at root.
  const rooted = appendChildByBuilderId(page, null, "<R />")!;
  assert(rooted.indexOf("<R />") < rooted.indexOf("</main>"), "null builder id should hit root");

  console.log("node-edit self-check OK");
}

if (process.argv[1] && /node-edit\.ts$/.test(process.argv[1])) demo();
