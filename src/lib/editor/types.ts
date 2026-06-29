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
  activeRoute?: string;
  activeFile?: string;
}
