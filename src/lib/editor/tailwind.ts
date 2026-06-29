/**
 * Tailwind className merging for the style inspector.
 *
 * Each inspector control maps to a "group" that owns a set of className tokens
 * (e.g. the Padding control owns `p-*`). Setting a control removes the tokens
 * that group owns and adds the new one — so re-editing padding replaces the old
 * value instead of stacking. Values off the Tailwind scale are emitted as
 * arbitrary values (`p-[24px]`, `text-[#188bdb]`), which stay clean and readable
 * in the committed source.
 *
 * ponytail: groups own a deliberately narrow token set (our emitted format + the
 * common scale). An exotic pre-existing utility outside these patterns is left
 * untouched rather than guessed at — upgrade the predicate if that bites.
 */

export type TwGroup =
  | "padding"
  | "margin"
  | "gap"
  | "display"
  | "flexDirection"
  | "align"
  | "justify"
  | "gridCols"
  | "width"
  | "maxWidth"
  | "height"
  | "fontSize"
  | "fontWeight"
  | "fontFamily"
  | "textAlign"
  | "textColor"
  | "bgColor"
  | "rounded"
  | "shadow"
  | "opacity";

/** Predicate: does `token` belong to this group (so a new value replaces it)? */
const OWNS: Record<TwGroup, (t: string) => boolean> = {
  padding: (t) => /^p-(\d|\[)/.test(t),
  margin: (t) => /^-?m-(\d|\[)/.test(t),
  gap: (t) => /^gap-(\d|\[)/.test(t),
  display: (t) =>
    /^(block|inline-block|inline|flex|inline-flex|grid|inline-grid|hidden|table|contents)$/.test(t),
  flexDirection: (t) => /^flex-(row|row-reverse|col|col-reverse)$/.test(t),
  align: (t) => /^items-/.test(t),
  justify: (t) => /^justify-/.test(t),
  gridCols: (t) => /^grid-cols-/.test(t),
  width: (t) => /^w-/.test(t),
  maxWidth: (t) => /^max-w-/.test(t),
  height: (t) => /^h-/.test(t),
  // text-[16px] / text-xs..text-9xl — arbitrary sizes start with a digit.
  fontSize: (t) => /^text-(xs|sm|base|lg|xl|\dxl|\[\d)/.test(t),
  fontWeight: (t) =>
    /^font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)$/.test(t),
  fontFamily: (t) => /^font-(sans|serif|mono)$/.test(t),
  textAlign: (t) => /^text-(left|center|right|justify)$/.test(t),
  // text-[#hex] / text-[rgb...] — arbitrary colors start with # or a letter.
  textColor: (t) => /^text-\[(#|rgb|hsl)/.test(t),
  bgColor: (t) => /^bg-/.test(t),
  rounded: (t) => /^rounded(-|$)/.test(t),
  shadow: (t) => /^shadow(-|$)/.test(t),
  opacity: (t) => /^opacity-/.test(t),
};

/**
 * Remove the tokens `group` owns from `existing`, then append `token` (when
 * non-null). Returns the new className string (space-separated, deduped).
 */
export function mergeClasses(
  existing: string,
  group: TwGroup,
  token: string | null,
): string {
  const owns = OWNS[group];
  const kept = existing
    .split(/\s+/)
    .filter(Boolean)
    .filter((t) => !owns(t));
  if (token) kept.push(token);
  // Dedup, preserve order.
  return [...new Set(kept)].join(" ");
}

/** Build the Tailwind token for a group + raw value from an inspector control.
 *  `value` is either a scale token ("center", "semibold", "lg") or a raw CSS
 *  value ("24px", "#188bdb", "1.5rem"); null clears the group. */
export function tokenFor(group: TwGroup, value: string | null): string | null {
  if (value == null || value === "") return null;
  const arb = (prefix: string) => `${prefix}-[${value.replace(/\s+/g, "_")}]`;
  switch (group) {
    case "padding":
      return /^\d+$/.test(value) ? `p-${value}` : arb("p");
    case "margin":
      return /^\d+$/.test(value) ? `m-${value}` : arb("m");
    case "gap":
      return /^\d+$/.test(value) ? `gap-${value}` : arb("gap");
    case "display":
      return value;
    case "flexDirection":
      return `flex-${value}`;
    case "align":
      return `items-${value}`;
    case "justify":
      return `justify-${value}`;
    case "gridCols":
      return `grid-cols-${value}`;
    case "width":
      return arb("w");
    case "maxWidth":
      return arb("max-w");
    case "height":
      return arb("h");
    case "fontSize":
      return /^(xs|sm|base|lg|xl|\dxl)$/.test(value) ? `text-${value}` : arb("text");
    case "fontWeight":
      return `font-${value}`;
    case "fontFamily":
      return `font-${value}`;
    case "textAlign":
      return `text-${value}`;
    case "textColor":
      return `text-[${value}]`;
    case "bgColor":
      return value.startsWith("#") || value.startsWith("rgb") ? `bg-[${value}]` : `bg-${value}`;
    case "rounded":
      return /^\d/.test(value) ? arb("rounded") : `rounded-${value}`;
    case "shadow":
      return value === "none" ? "shadow-none" : `shadow-${value}`;
    case "opacity":
      return `opacity-${value}`;
  }
}

/** Read the current display value for a group from an element's classes (for
 *  populating inspector controls). "" when the group isn't set. Arbitrary
 *  values return their inner content (`p-[24px]` → "24px"); scale tokens return
 *  the suffix (`items-center` → "center", `flex` → "flex"). */
export function readValue(classes: string[], group: TwGroup): string {
  const t = classes.find(OWNS[group]);
  if (!t) return "";
  const arb = /\[([^\]]+)\]/.exec(t);
  if (arb) return arb[1].replace(/_/g, " ");
  const dash = t.lastIndexOf("-");
  return dash >= 0 ? t.slice(dash + 1) : t;
}

/** Self-check: `npx tsx src/lib/editor/tailwind.ts`. */
function demo(): void {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
  };
  // Replace, not stack.
  assert(
    mergeClasses("p-2 text-center", "padding", "p-6") === "text-center p-6",
    "padding should replace p-2",
  );
  // Arbitrary value.
  assert(tokenFor("padding", "24px") === "p-[24px]", "arbitrary padding");
  assert(tokenFor("padding", "6") === "p-6", "scale padding");
  // Color owns only arbitrary text-[...] — must not eat text-lg or text-center.
  assert(
    mergeClasses("text-lg text-center", "textColor", "text-[#188bdb]") ===
      "text-lg text-center text-[#188bdb]",
    "textColor must not strip size/align",
  );
  assert(
    mergeClasses("text-[#000] font-bold", "textColor", "text-[#fff]") ===
      "font-bold text-[#fff]",
    "textColor replaces prior color",
  );
  // fontSize owns text-lg but not text-center.
  assert(
    mergeClasses("text-lg text-center", "fontSize", "text-xl") ===
      "text-center text-xl",
    "fontSize replaces size, keeps align",
  );
  // Clear a group.
  assert(mergeClasses("opacity-50 p-4", "opacity", null) === "p-4", "clear opacity");
  console.log("tailwind self-check OK");
}

if (process.argv[1] && /tailwind\.ts$/.test(process.argv[1])) demo();
