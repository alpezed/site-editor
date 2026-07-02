import { parse as babelParse } from "@babel/parser";
import {
  assignBuilderPaths,
  BUILDER_ATTR,
  makeBuilderId,
  nodeForBuilderId,
  parseBuilderId,
} from "@/lib/editor/builder-path";

export const SX_ATTR = "data-sx-id";

type AnyNode = {
  type: string;
  start: number;
  end: number;
  loc?: { start?: { line: number; column: number } };
  [k: string]: unknown;
};

function parseSafe(source: string) {
  try {
    return babelParse(source, {
      sourceType: "module",
      plugins: ["typescript", "jsx"],
      errorRecovery: true,
    });
  } catch {
    return null;
  }
}

/**
 * Stamp every JSX element with `data-sx-id="<filePath>:<line>:<col>"` (the
 * element's position in THIS unstamped source) and `data-builder-id="<file>@<path>"`
 * (its stable structural path — see builder-path.ts). The editor agent reads the
 * ids off the DOM; the server re-parses the same unstamped source and locates the
 * node by loc / path.
 *
 * Stamps are inserted by TEXT SPLICING — ` attr="…"` right after the tag name —
 * never by reprinting the AST. That keeps every byte of the original source in
 * place, so `stripSxIds(stampSource(s)) === s` exactly and the loc stamps stay
 * valid against the stripped file. (recast reprinting used to re-wrap opening
 * tags, which shifted every following line and broke loc lookups.)
 *
 * Stamping is re-run from scratch on every sandbox write, never persisted,
 * never committed.
 *
 * ponytail: the attr only reaches the DOM for intrinsic elements (div/h1/...)
 * and components that spread props. A component that drops props won't surface
 * its id — but an added section's own component file is stamped too, so its
 * inner intrinsic elements stay selectable even when the <Section/> tag isn't.
 */
export function stampSource(filePath: string, source: string): string {
  const ast = parseSafe(source);
  if (!ast) return source; // unparseable file: serve as-is, just not stampable

  const builderPaths = assignBuilderPaths((ast as { program: unknown }).program);

  const insertions: { at: number; text: string }[] = [];
  for (const [node, bpath] of builderPaths) {
    const el = node as unknown as AnyNode;
    if (el.type !== "JSXElement") continue; // fragments have no attributes
    const open = el.openingElement as AnyNode;
    const attrs = (open.attributes as AnyNode[]) ?? [];
    const hasAttr = (name: string) =>
      attrs.some(
        (a) =>
          a.type === "JSXAttribute" &&
          (a.name as AnyNode | undefined)?.name === name,
      );
    const loc = open.loc?.start;
    let text = "";
    if (!hasAttr(SX_ATTR) && loc) {
      text += ` ${SX_ATTR}="${filePath}:${loc.line}:${loc.column}"`;
    }
    if (!hasAttr(BUILDER_ATTR)) {
      text += ` ${BUILDER_ATTR}="${makeBuilderId(filePath, bpath)}"`;
    }
    if (text) insertions.push({ at: (open.name as AnyNode).end, text });
  }

  // Splice from the end so earlier offsets stay valid.
  insertions.sort((a, b) => b.at - a.at);
  let out = source;
  for (const ins of insertions) {
    out = out.slice(0, ins.at) + ins.text + out.slice(ins.at);
  }
  return out;
}

/** Remove any `data-sx-id` / `data-builder-id` attributes — defensive guard
 *  before commit so a stray stamp can never reach git, and so loc/path stamps
 *  refer to the clean source. (Our own emitted attributes; safe to strip
 *  textually.) */
export function stripSxIds(source: string): string {
  return source.replace(
    /\s+(?:data-sx-id|data-builder-id)=("[^"]*"|\{[^}]*\})/g,
    "",
  );
}

/** Parse a `data-sx-id` value into its parts. */
export function parseSxId(
  id: string,
): { filePath: string; line: number; column: number } | null {
  const m = /^(.*):(\d+):(\d+)$/.exec(id);
  if (!m) return null;
  return { filePath: m[1], line: Number(m[2]), column: Number(m[3]) };
}

/** Self-check: `npx tsx src/lib/editor/stamp.ts`. */
function demo(): void {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
  };
  const src = [
    `export default function Home() {`,
    `  // keep this comment`,
    `  return (`,
    `    <main className="x">`,
    `      <h1>Hi</h1>`,
    `    </main>`,
    `  );`,
    `}`,
  ].join("\n");

  const stamped = stampSource("app/page.tsx", src);
  assert(stamped.includes(SX_ATTR), "no stamp added");
  assert(stamped.includes("// keep this comment"), "comment lost");
  // Every opening element stamped: <main> and <h1>.
  assert((stamped.match(/data-sx-id=/g) || []).length === 2, "expected 2 stamps");
  // Idempotent.
  assert(
    (stampSource("app/page.tsx", stamped).match(/data-sx-id=/g) || []).length === 2,
    "re-stamp not idempotent",
  );
  // Strip round-trips to the EXACT original source — this is what keeps the loc
  // stamps valid against the stripped file (the core invariant).
  assert(stripSxIds(stamped) === src, "strip is not byte-exact");
  assert(!stripSxIds(stamped).includes(BUILDER_ATTR), "builder strip failed");
  // id resolves.
  const id = /data-sx-id="([^"]+)"/.exec(stamped)![1];
  assert(parseSxId(id)?.filePath === "app/page.tsx", "id parse failed");
  // The stamped loc matches the element's position in the ORIGINAL source:
  // <main> opens at line 4, column 4 (0-based).
  const mainId = /<main[^>]*data-sx-id="([^"]+)"/s.exec(stamped)![1];
  const mainLoc = parseSxId(mainId)!;
  assert(mainLoc.line === 4 && mainLoc.column === 4, "loc drifted: " + mainId);

  // data-builder-id stamped on the SAME pass resolves back to the right element
  // on the STRIPPED source (proves stamp↔locate path agreement).
  const bid = /data-builder-id="([^"]+)"/g;
  const stripped = stripSxIds(stamped);
  const strippedAst = babelParse(stripped, { sourceType: "module", plugins: ["typescript", "jsx"] });
  let m: RegExpExecArray | null;
  let checked = 0;
  while ((m = bid.exec(stamped))) {
    const parsedId = parseBuilderId(m[1])!;
    const node = nodeForBuilderId((strippedAst as { program: unknown }).program, parsedId.path);
    assert(node != null, "builder id did not resolve on stripped source: " + m[1]);
    checked++;
  }
  assert(checked === 2, "expected 2 builder ids, got " + checked);

  // Multi-element realistic page: strip(stamp(s)) === s for every shape we hit
  // in the wild (map callbacks, fragments, self-closing components).
  const page = [
    `import Hero from "@/components/Hero";`,
    `export default function P() {`,
    `  return (`,
    `    <>`,
    `      <Hero />`,
    `      <div className="grid">`,
    `        {[1, 2].map((i) => (`,
    `          <p key={i} className="card">Card {i}</p>`,
    `        ))}`,
    `      </div>`,
    `    </>`,
    `  );`,
    `}`,
  ].join("\n");
  const pageStamped = stampSource("app/p.tsx", page);
  assert(stripSxIds(pageStamped) === page, "realistic page strip not byte-exact");
  assert((pageStamped.match(/data-sx-id=/g) || []).length === 3, "expected 3 stamps on page");
  console.log("stamp self-check OK");
}

if (process.argv[1] && /stamp\.ts$/.test(process.argv[1])) demo();
