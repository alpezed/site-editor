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

function escapeJsxText(value: string): string {
  return value.replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/[{}]/g, (c) =>
    c === "{" ? "&#123;" : "&#125;",
  );
}

function escapeForQuote(value: string, quote: string): string {
  const esc = value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n");
  return esc.split(quote).join(`\\${quote}`);
}
