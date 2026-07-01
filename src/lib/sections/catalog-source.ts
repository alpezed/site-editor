import fs from "node:fs";
import path from "node:path";

/**
 * SERVER-ONLY loader for section component source. Reads the real Tailwind `.tsx`
 * files under `sandbox-templates/_shared/components/<name>.tsx` (kept out of
 * catalog.ts because that module is imported by the client gallery).
 *
 * `applySections` writes the returned source into the user's repo — once per name,
 * so re-adding the same component reuses one file instead of minting a new one.
 *
 * Vercel: next.config's outputFileTracingIncludes ships these files so
 * process.cwd() resolves them in the serverless bundle.
 */
const DIR = path.join(
  process.cwd(),
  "sandbox-templates",
  "_shared",
  "components",
);

export function getComponentSource(name: string): string | null {
  // name is a PascalCase catalog id; reject anything else so it can't escape DIR.
  if (!/^[A-Za-z0-9]+$/.test(name)) return null;
  try {
    return fs.readFileSync(path.join(DIR, `${name}.tsx`), "utf8");
  } catch {
    return null;
  }
}
