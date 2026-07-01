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

/** Record of one element/component added from the gallery. Metadata only (the
 *  added-blocks list + undo): the actual placement lives in `fileOverrides` — at
 *  add time the element is inserted into the clicked container by its data-sx-id
 *  loc (deterministic file manipulation) and the resulting file is stored as an
 *  override. Each instance also has its own component file (also a fileOverride),
 *  so two copies of the same catalog section are independent. */
export interface SectionInstance {
  /** Stable unique id for this placement (list identity + undo). */
  key: string;
  /** Catalog component name — drives the (shared) component file name + import.
   *  All placements of the same component share ONE file, keyed by this name. */
  name: string;
  /** Stable builder id (`<file>@<path>`) of the container this was added inside;
   *  the component tag is inserted as that element's last child on sync/save.
   *  Absent → appended at the page root. Survives reload (see builder-path.ts). */
  builderId?: string;
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
  /** data-builder-id ("<file>@<path>") of the nearest stamped element — the
   *  stable anchor used when adding an element inside this one. */
  builderId?: string | null;
  /** data-builder-id of the nearest CONTAINER (self or ancestor) that can hold a
   *  block child — the anchor an "add element" drops into, so adds land where the
   *  user is even when a leaf (text/button) is selected. null only at the root. */
  containerBuilderId?: string | null;
  /** Component/display name (React fiber) or tag name. */
  name: string;
  /** Lowercased tag name (div, h1, button…). */
  tag: string;
  /** Current className tokens on the element. */
  classes: string[];
  /** Visible text, when the element is a text leaf. */
  text?: string;
  /** Normalized visible text of the element — anchors where a newly added
   *  element is inserted (after this one) in source. Set for every selection. */
  anchor?: string;
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

/** Coerce stored sections to instances. Handles legacy shapes: bare id-strings
 *  (oldest sessions) and `{ key, id }` (pre-name refactor) both map onto `name`. */
export function normalizeSections(
  raw: EditorState["sections"],
): SectionInstance[] {
  if (!raw) return [];
  return raw.map((s, i) => {
    if (typeof s === "string") return { key: `${s}__${i}`, name: s };
    // `name` is the current field; `id` is the legacy one.
    const name = s.name ?? (s as { id?: string }).id ?? "";
    return { key: s.key, name, builderId: s.builderId };
  });
}

/** Repo-relative component file for a section — keyed by component NAME, so every
 *  placement of the same catalog component resolves to (and rewrites) one file. */
export function sectionInstancePath(name: string): string {
  return `components/site-editor-sections/${name}.tsx`;
}
