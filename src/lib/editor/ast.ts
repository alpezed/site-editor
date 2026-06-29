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
