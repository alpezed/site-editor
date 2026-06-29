import { create } from "zustand";
import type { Selection, TreeNode, SectionInstance } from "@/lib/editor/types";

/** The slice of editor state that undo/redo snapshots. */
export interface Snapshot {
  pending: Record<string, Record<string, string>>;
  textEdits: Record<string, string>;
  sections: SectionInstance[];
  fileOverrides: Record<string, string>;
}

interface EditorStore {
  /** Currently selected element (from the in-iframe agent). */
  selection: Selection | null;
  setSelection: (s: Selection | null) => void;

  /** Layers tree, refreshed from the agent on demand. */
  tree: TreeNode[];
  setTree: (t: TreeNode[]) => void;

  // Undo/redo: `editor.tsx` owns the live edit-state; here we keep the past /
  // future stacks of snapshots. `record(prev)` is called with the state as it
  // was *before* a change; undo/redo return the snapshot to apply (or null).
  past: Snapshot[];
  future: Snapshot[];
  canUndo: boolean;
  canRedo: boolean;
  record: (prev: Snapshot) => void;
  undo: (current: Snapshot) => Snapshot | null;
  redo: (current: Snapshot) => Snapshot | null;
  resetHistory: () => void;
}

const LIMIT = 50;

export const useEditorStore = create<EditorStore>((set, get) => ({
  selection: null,
  setSelection: (s) => set({ selection: s }),

  tree: [],
  setTree: (t) => set({ tree: t }),

  past: [],
  future: [],
  canUndo: false,
  canRedo: false,

  record: (prev) =>
    set((st) => {
      const past = [...st.past, prev].slice(-LIMIT);
      return { past, future: [], canUndo: true, canRedo: false };
    }),

  undo: (current) => {
    const { past } = get();
    if (past.length === 0) return null;
    const prev = past[past.length - 1];
    set((st) => ({
      past: st.past.slice(0, -1),
      future: [...st.future, current],
      canUndo: st.past.length - 1 > 0,
      canRedo: true,
    }));
    return prev;
  },

  redo: (current) => {
    const { future } = get();
    if (future.length === 0) return null;
    const next = future[future.length - 1];
    set((st) => ({
      future: st.future.slice(0, -1),
      past: [...st.past, current],
      canUndo: true,
      canRedo: st.future.length - 1 > 0,
    }));
    return next;
  },

  resetHistory: () =>
    set({ past: [], future: [], canUndo: false, canRedo: false }),
}));
