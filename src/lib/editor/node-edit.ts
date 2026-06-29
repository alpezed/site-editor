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
  | { kind: "op"; op: ElementOp };

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
  }

  if (out == null) return null;
  // Never emit source that doesn't parse.
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

  console.log("node-edit self-check OK");
}

if (process.argv[1] && /node-edit\.ts$/.test(process.argv[1])) demo();
