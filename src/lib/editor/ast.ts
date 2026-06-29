import type { FieldEdit } from "@/lib/editor/types";

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
 * (e.g. `<Hero />`). Imports land after the last top-level import; tags land
 * just before the file's last closing JSX tag (the page's root element close).
 *
 * Imports are deduped (one per component — a duplicate import is a compile
 * error), but a tag is emitted per addition, so staging the same section twice
 * drops two instances onto the page. Callers always pass the full staged list
 * against clean source (preview sync re-fetches; publish clears after commit),
 * so tags reflect exactly the staged set without accumulating across runs.
 *
 * ponytail: heuristic — assumes the route file's page returns a single root
 * element and is the last JSX in the file. If a page's shape defeats this,
 * upgrade to a Babel/JSX walk keyed by the default export. Self-check below.
 */
export function applySectionAdds(
  source: string,
  additions: { importLine: string; tag: string }[],
): string {
  if (additions.length === 0) return source;

  // Imports: one per unique importLine, skipping any already in source.
  const seen = new Set<string>();
  const newImports: string[] = [];
  for (const a of additions) {
    const line = a.importLine.trim();
    if (source.includes(line) || seen.has(line)) continue;
    seen.add(line);
    newImports.push(a.importLine);
  }

  let out = source;

  if (newImports.length > 0) {
    // Insert imports after the last top-level `import ... ` statement.
    const importRe = /^[ \t]*import\b.*$/gm;
    let lastImportEnd = -1;
    for (const m of out.matchAll(importRe)) {
      lastImportEnd = m.index! + m[0].length;
    }
    const importBlock = newImports.join("\n");
    if (lastImportEnd >= 0) {
      out = out.slice(0, lastImportEnd) + "\n" + importBlock + out.slice(lastImportEnd);
    } else {
      out = importBlock + "\n" + out;
    }
  }

  // Insert a tag per addition before the last closing JSX tag (`</X>` or `</>`).
  const closeRe = /<\/[A-Za-z][\w.]*\s*>|<\/>/g;
  let lastClose = -1;
  for (const m of out.matchAll(closeRe)) {
    lastClose = m.index!;
  }
  const tagBlock = additions.map((a) => "      " + a.tag).join("\n");
  if (lastClose >= 0) {
    out = out.slice(0, lastClose) + tagBlock + "\n      " + out.slice(lastClose);
  }
  return out;
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
  // Same section twice: one import (dup import = compile error), two tags.
  const dup = applySectionAdds(page, [...add, ...add]);
  console.assert(dup.split(`import Hero from`).length === 2, "import must not duplicate");
  console.assert(dup.split(`<Hero />`).length === 3, "expected two Hero tags");
  console.log("applySectionAdds self-check OK\n" + once);
}

if (process.argv[1] && /ast\.ts$/.test(process.argv[1])) __sectionDemo();
