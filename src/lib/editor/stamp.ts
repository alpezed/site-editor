import * as recast from "recast";
import * as babelTs from "recast/parsers/babel-ts";
import { parse as babelParse } from "@babel/parser";
import {
  assignBuilderPaths,
  BUILDER_ATTR,
  makeBuilderId,
  nodeForBuilderId,
  parseBuilderId,
} from "@/lib/editor/builder-path";

// Use recast's own ast-types visitor + builders: they're guaranteed compatible
// with the AST recast.parse produces. @babel/traverse expects to crawl scope on
// a babel File and silently no-ops on a recast tree.
const { visit, builders: b } = recast.types;

export const SX_ATTR = "data-sx-id";

/**
 * Stamp every intrinsic JSX element with `data-sx-id="<filePath>:<line>:<col>"`,
 * where line/col are the element's position in THIS (unstamped) source. The
 * editor agent reads the id on click; the server then re-parses the same
 * unstamped source and locates the node by that loc (see node-edit.ts). The id
 * therefore always references original coordinates — stamping is re-run from
 * scratch on every sandbox write, never persisted, never committed.
 *
 * recast preserves the formatting of untouched code while inserting the attr.
 *
 * ponytail: the attr only reaches the DOM for intrinsic elements (div/h1/...)
 * and components that spread props. A component that drops props won't surface
 * its id — but an added section's own component file is stamped too, so its
 * inner intrinsic elements stay selectable even when the <Section/> tag isn't.
 */
export function stampSource(filePath: string, source: string): string {
  let ast;
  try {
    ast = recast.parse(source, { parser: babelTs });
  } catch {
    return source; // unparseable file: serve as-is, just not stampable
  }

  // Stable structural path per JSX element (for the builder's add anchor). Keyed
  // by the same node objects the visitor sees below.
  const builderPaths = assignBuilderPaths(ast);

  visit(ast, {
    visitJSXOpeningElement(path) {
      const node = path.node;
      const attrs = node.attributes ?? [];
      const hasAttr = (name: string) =>
        attrs.some(
          (a) =>
            a.type === "JSXAttribute" &&
            a.name.type === "JSXIdentifier" &&
            a.name.name === name,
        );
      const loc = node.loc?.start;
      if (!hasAttr(SX_ATTR) && loc) {
        const id = `${filePath}:${loc.line}:${loc.column}`;
        attrs.push(b.jsxAttribute(b.jsxIdentifier(SX_ATTR), b.stringLiteral(id)));
      }
      // data-builder-id="<file>@<path>" — survives reload and stays put when a
      // child is appended elsewhere (see builder-path.ts).
      const owner = path.parentPath?.node;
      const bpath = owner ? builderPaths.get(owner) : undefined;
      if (!hasAttr(BUILDER_ATTR) && bpath != null) {
        attrs.push(
          b.jsxAttribute(b.jsxIdentifier(BUILDER_ATTR), b.stringLiteral(makeBuilderId(filePath, bpath))),
        );
      }
      node.attributes = attrs;
      this.traverse(path);
    },
  });

  try {
    return recast.print(ast).code;
  } catch {
    return source;
  }
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
  // Strip round-trips to original (modulo recast print) — both id kinds gone.
  assert(!stripSxIds(stamped).includes(SX_ATTR), "strip failed");
  assert(!stripSxIds(stamped).includes(BUILDER_ATTR), "builder strip failed");
  // id resolves.
  const id = /data-sx-id="([^"]+)"/.exec(stamped)![1];
  assert(parseSxId(id)?.filePath === "app/page.tsx", "id parse failed");

  // data-builder-id stamped on the SAME pass resolves back to the right element
  // on the STRIPPED source (proves stamp↔locate path agreement across parsers).
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
  console.log("stamp self-check OK");
}

if (process.argv[1] && /stamp\.ts$/.test(process.argv[1])) demo();
