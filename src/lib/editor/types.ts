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

/** Editor session state persisted for autosave. */
export interface EditorState {
  /** filePath -> field -> value */
  pending: Record<string, Record<string, string>>;
  /** Click-to-edit text replacements, keyed by original text -> new text.
   *  Not tied to a file: applied by value across the repo source on publish. */
  textEdits?: Record<string, string>;
  /** Ordered catalog ids of sections added from the Section Gallery (Explore).
   *  Each is written as a component file + appended to the home route on sync/save. */
  sections?: string[];
  /** Whole-file overrides from in-preview element ops (reorder/duplicate/delete).
   *  repoPath -> full file content. Applied last on sync/save (wins per file). */
  fileOverrides?: Record<string, string>;
  activeRoute?: string;
  activeFile?: string;
}
