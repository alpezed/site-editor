import type { FieldEdit } from "@/lib/editor/types";
import { locateByAnchor, lineIndent, parsesOk } from "@/lib/editor/element-ops";

/**
 * Applies field edits to a component source file.
 *
 * Editable fields are declared by the developer via `export const editor`. By
 * convention their current values live in a co-located default content object:
 *
 *   export const content = {
 *     title: "Welcome",
 *     subtitle: "...",
 *   }
 *
 * This applies edits by rewriting the matching key inside that `content`
 * object literal, and as a fallback rewrites a JSX prop / attribute with the
 * same name. The string-literal rewrite keeps formatting stable and is
 * dependency-free.
 *
 * For richer transforms (nested values, expressions, adding new keys) swap the
 * body for a Babel/recast round-trip — the function signature stays the same.
 */
export function applyFieldEdits(source: string, edits: FieldEdit[]): string {
  let out = source;
  for (const { field, value } of edits) {
    out = rewriteContentKey(out, field, value) ?? out;
  }
  return out;
}

function escapeString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

/**
 * Rewrite `field: "old"` inside the `content` object, falling back to a JSX
 * attribute `field="old"` / `field={"old"}`. Returns null when nothing matched.
 */
function rewriteContentKey(
  source: string,
  field: string,
  value: string,
): string | null {
  const safe = escapeString(value);
  const key = escapeRegex(field);

  // 1) Object literal key:  title: "..."  /  title: '...'
  const objRe = new RegExp(`(\\b${key}\\s*:\\s*)(["'])(?:\\\\.|(?!\\2).)*\\2`);
  if (objRe.test(source)) {
    return source.replace(objRe, `$1"${safe}"`);
  }

  // 2) JSX attribute:  title="..."
  const attrRe = new RegExp(`(\\b${key}=)(["'])(?:\\\\.|(?!\\2).)*\\2`);
  if (attrRe.test(source)) {
    return source.replace(attrRe, `$1"${safe}"`);
  }

  // 3) JSX expression attribute:  title={"..."}
  const exprRe = new RegExp(`(\\b${key}=\\{)(["'])(?:\\\\.|(?!\\2).)*\\2(\\})`);
  if (exprRe.test(source)) {
    return source.replace(exprRe, `$1"${safe}"$3`);
  }

  return null;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Click-to-edit text replacements. Each edit is the original visible text and
 * its replacement; we rewrite that text where it appears as JSX text content or
 * a string literal. Matching is by value (the editor has no DOM→source map), so
 * the original text must be reasonably unique.
 *
 * ponytail: naive value-based global replace. Collisions (same string in two
 * places, or text split across JSX expressions) are not handled — upgrade to a
 * Babel/JSX AST walk keyed by source position if that bites.
 */
export function applyTextEdits(
  source: string,
  edits: { from: string; to: string }[],
): string {
  let out = source;
  for (const { from, to } of edits) {
    const trimmed = from.trim();
    if (!trimmed) continue;
    const f = escapeRegex(trimmed);

    // 1) JSX text node:  >  Welcome  <   (allow surrounding whitespace)
    out = out.replace(
      new RegExp(`(>\\s*)${f}(\\s*<)`, "g"),
      (_m, a, b) => `${a}${escapeJsxText(to)}${b}`,
    );

    // 2) String literal:  "Welcome" / 'Welcome' / \`Welcome\`
    out = out.replace(
      new RegExp(`(["'\`])${f}\\1`, "g"),
      (_m, q) => `${q}${escapeForQuote(to, q)}${q}`,
    );
  }
  return out;
}

/**
 * Append pre-built sections to a route file. Each addition carries a ready
 * `importLine` (e.g. `import Hero from "../components/.../hero"`) and a `tag`
 * (e.g. `<Hero />`). Imports land after the last top-level import. A tag with an
 * `anchor` (the visible text of the element "Add below" was clicked on) is
 * spliced right AFTER the JSX element rendering that text — so the section lands
 * where the user dropped it. Tags with no anchor (gallery-appended, or an anchor
 * that can't be located here) fall back to just before the file's last closing
 * JSX tag (the page's root element close).
 *
 * Idempotent per instance: each addition's `importLine` is unique (keyed by the
 * instance key), so an addition whose import already appears is skipped whole
 * (import AND tag). That makes it safe to apply LAST — on top of an element-op
 * override of the same file — without duplicating, and without a stale override
 * snapshot ever clobbering the staged sections.
 *
 * ponytail: anchored insert re-parses once per anchored addition and validates
 * the result, falling back to end-append if the splice would break JSX (e.g. the
 * anchor matched the root element → two roots). Multiple sections sharing one
 * anchor land in reverse add-order; rare enough to leave. Self-check below.
 */
export function applySectionAdds(
  source: string,
  additions: { importLine: string; tag: string; anchor?: string }[],
): string {
  // Fresh = not already in source, and not duplicated within this batch.
  const seen = new Set<string>();
  const fresh = additions.filter((a) => {
    const line = a.importLine.trim();
    if (source.includes(line) || seen.has(line)) return false;
    seen.add(line);
    return true;
  });
  if (fresh.length === 0) return source;

  let out = source;

  // Insert imports after the last top-level `import ... ` statement.
  const importRe = /^[ \t]*import\b.*$/gm;
  let lastImportEnd = -1;
  for (const m of out.matchAll(importRe)) {
    lastImportEnd = m.index! + m[0].length;
  }
  const importBlock = fresh.map((a) => a.importLine).join("\n");
  if (lastImportEnd >= 0) {
    out = out.slice(0, lastImportEnd) + "\n" + importBlock + out.slice(lastImportEnd);
  } else {
    out = importBlock + "\n" + out;
  }

  for (const a of fresh) {
    out = insertTag(out, a.tag, a.anchor);
  }
  return out;
}

/** Splice one section tag into `source`: after the anchor element if it locates
 *  and the result still parses, else before the file's last closing JSX tag. */
function insertTag(source: string, tag: string, anchor?: string): string {
  if (anchor) {
    const hit = locateByAnchor(source, anchor);
    if (hit) {
      const indent = lineIndent(source, hit.node.start);
      const end = hit.node.end;
      const candidate =
        source.slice(0, end) + "\n" + indent + tag + source.slice(end);
      if (parsesOk(candidate)) return candidate;
      // else: splice would break JSX (anchor hit the root) — fall through.
    }
  }
  // Insert before the last closing JSX tag (`</X>` or `</>`).
  const closeRe = /<\/[A-Za-z][\w.]*\s*>|<\/>/g;
  let lastClose = -1;
  for (const m of source.matchAll(closeRe)) {
    lastClose = m.index!;
  }
  if (lastClose < 0) return source;
  return source.slice(0, lastClose) + "      " + tag + "\n      " + source.slice(lastClose);
}

function escapeJsxText(value: string): string {
  return value.replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/[{}]/g, (c) =>
    c === "{" ? "&#123;" : "&#125;",
  );
}

function escapeForQuote(value: string, quote: string): string {
  const esc = value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n");
  return esc.split(quote).join(`\\${quote}`);
}

/**
 * Self-check for applySectionAdds. Run: `npx tsx src/lib/editor/ast.ts`.
 * Asserts the import lands after existing imports and the tag lands inside the
 * root element, and that a second run is idempotent.
 */
export function __sectionDemo(): void {
  const page = [
    `import Image from "next/image";`,
    ``,
    `export default function Home() {`,
    `  return (`,
    `    <main>`,
    `      <h1>Hi</h1>`,
    `    </main>`,
    `  );`,
    `}`,
  ].join("\n");
  const add = [
    { importLine: `import Hero from "../components/site-editor-sections/hero";`, tag: `<Hero />` },
  ];
  const once = applySectionAdds(page, add);
  console.assert(once.includes(`import Hero from`), "import not inserted");
  console.assert(
    once.indexOf(`import Hero`) > once.indexOf(`import Image`),
    "import not placed after existing imports",
  );
  console.assert(
    once.indexOf(`<Hero />`) > once.indexOf(`<h1>Hi</h1>`) &&
      once.indexOf(`<Hero />`) < once.indexOf(`</main>`),
    "tag not inside root element",
  );
  // Idempotent per import: re-applying (or a dup import in the batch) is a no-op.
  console.assert(applySectionAdds(once, add) === once, "not idempotent on re-apply");
  const dup = applySectionAdds(page, [...add, ...add]);
  console.assert(dup.split(`import Hero from`).length === 2, "import must not duplicate");
  console.assert(dup.split(`<Hero />`).length === 2, "tag must not duplicate per import");

  // Distinct instances (unique imports) → both land, even applied on top of one.
  const two = applySectionAdds(once, [
    { importLine: `import B from "../components/site-editor-sections/b";`, tag: `<B />` },
  ]);
  console.assert(two.includes(`import Hero`) && two.includes(`import B`), "second instance dropped");
  console.assert(two.split(`<Hero />`).length === 2 && two.includes(`<B />`), "tags wrong applied on top");

  // Anchored insert: the tag lands right after the element rendering the anchor,
  // not at the page end.
  const page2 = [
    `export default function Home() {`,
    `  return (`,
    `    <main>`,
    `      <p>Looking for a starting point</p>`,
    `      <a>Deploy Now</a>`,
    `    </main>`,
    `  );`,
    `}`,
  ].join("\n");
  const anchored = applySectionAdds(page2, [
    { importLine: `import C from "./c";`, tag: `<C />`, anchor: "Looking for a starting point" },
  ]);
  console.assert(
    anchored.indexOf(`<C />`) > anchored.indexOf(`</p>`) &&
      anchored.indexOf(`<C />`) < anchored.indexOf(`Deploy Now`),
    "anchored tag not placed after the clicked element: " + anchored,
  );
  // Anchor that would split the root (matches <main>) → safe end-append fallback.
  const rootAnchored = applySectionAdds(page2, [
    { importLine: `import D from "./d";`, tag: `<D />`, anchor: "Looking for a starting point Deploy Now" },
  ]);
  console.assert(
    rootAnchored.indexOf(`<D />`) < rootAnchored.indexOf(`</main>`) &&
      rootAnchored.indexOf(`<D />`) > rootAnchored.indexOf(`Deploy Now`),
    "root-matching anchor should fall back to end-append: " + rootAnchored,
  );
  console.log("applySectionAdds self-check OK\n" + once);
}

if (process.argv[1] && /ast\.ts$/.test(process.argv[1])) __sectionDemo();
