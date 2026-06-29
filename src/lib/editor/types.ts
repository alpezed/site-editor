/** A single field edit made in the visual editor. */
export interface FieldEdit {
  field: string;
  value: string;
}

/** All pending edits for one file. */
export interface FileEdits {
  filePath: string;
  edits: FieldEdit[];
}

/** One placement of a gallery section. Each instance gets its own component
 *  file + import + a `data-section-key` wrapper in the page, so two copies of
 *  the same catalog section are independently editable and removable. */
export interface SectionInstance {
  /** Stable unique id for this placement (drives file name, import + tag key). */
  key: string;
  /** Catalog section id this instance was created from. */
  id: string;
  /** Visible text of the element "Add below" was clicked on. The section tag is
   *  spliced right after the JSX node rendering this text on sync/save; absent
   *  for gallery-appended sections (which land at the page end). */
  afterAnchor?: string;
}

/** Editor session state persisted for autosave. */
export interface EditorState {
  /** filePath -> field -> value */
  pending: Record<string, Record<string, string>>;
  /** Click-to-edit text replacements, keyed by original text -> new text.
   *  Not tied to a file: applied by value across the repo source on publish. */
  textEdits?: Record<string, string>;
  /** Sections added from the Section Gallery (Explore), in order. Each is
   *  written as a component file + appended to the home route on sync/save.
   *  Legacy sessions stored bare catalog-id strings — normalize before use. */
  sections?: (string | SectionInstance)[];
  /** Whole-file overrides from in-preview element ops (reorder/duplicate/delete).
   *  repoPath -> full file content. Applied last on sync/save (wins per file). */
  fileOverrides?: Record<string, string>;
  activeRoute?: string;
  activeFile?: string;
}

/** The element selected in the canvas, reported by the in-iframe agent. */
export interface Selection {
  /** data-sx-id: "<filePath>:<line>:<column>" (column 0-based). */
  sxId: string;
  /** Component/display name (React fiber) or tag name. */
  name: string;
  /** Lowercased tag name (div, h1, button…). */
  tag: string;
  /** Current className tokens on the element. */
  classes: string[];
  /** Visible text, when the element is a text leaf. */
  text?: string;
  /** data-section-key of the enclosing gallery section, if any. */
  sectionKey?: string;
}

/** A node in the Layers tree, built from the live DOM by the agent. */
export interface TreeNode {
  sxId?: string;
  name: string;
  tag: string;
  sectionKey?: string;
  children: TreeNode[];
}

/** Coerce stored sections (which may be legacy id-strings) to instances. */
export function normalizeSections(
  raw: EditorState["sections"],
): SectionInstance[] {
  if (!raw) return [];
  return raw.map((s, i) =>
    typeof s === "string" ? { key: `${s}__${i}`, id: s } : s,
  );
}

/** Repo-relative component file for a section instance. */
export function sectionInstancePath(key: string): string {
  return `components/site-editor-sections/${key}.tsx`;
}

/** JS identifier used for the instance's import + JSX tag. */
export function sectionImportName(key: string): string {
  return `Section_${key.replace(/[^a-zA-Z0-9]/g, "_")}`;
}
