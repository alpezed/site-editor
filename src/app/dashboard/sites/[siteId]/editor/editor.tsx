"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Pencil } from "lucide-react";
import type { ProjectMetadata } from "@/lib/import/component-scanner";
import {
  type EditorState,
  type SectionInstance,
  normalizeSections,
} from "@/lib/editor/types";
import type { DeploymentStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Toolbar, type EditorMode, type Device } from "./toolbar";
import { SectionGallery } from "./section-gallery";
import { LeftPanel } from "./left-panel";
import { RightInspector } from "./right-inspector";
import { useEditorStore, type Snapshot } from "@/lib/editor/store";
import { mergeClasses } from "@/lib/editor/tailwind";
import type { Patch } from "@/lib/editor/node-edit";
import { getSection } from "@/lib/sections/catalog";
import {
  PushDialog,
  PublishDialog,
  HistoryDialog,
  type DeploymentLite,
} from "./dialogs";

interface Props {
  siteId: string;
  siteName: string;
  repositoryName: string;
  branch: string;
  imported: boolean;
  previewUrl: string | null;
  metadata: ProjectMetadata;
  initialState: EditorState;
  latestDeploymentStatus: DeploymentStatus | null;
  hasDeployed: boolean;
  deployments: DeploymentLite[];
}

export function Editor(props: Props) {
  const { metadata } = props;
  const [mode, setMode] = useState<EditorMode>("build");
  const [device, setDevice] = useState<Device>("desktop");
  const [editMode, setEditMode] = useState(false);

  const [activeFile] = useState<string | null>(
    metadata.components[0]?.filePath ?? null,
  );
  const [pending, setPending] = useState<EditorState["pending"]>(
    props.initialState.pending ?? {},
  );
  const [textEdits, setTextEdits] = useState<Record<string, string>>(
    props.initialState.textEdits ?? {},
  );
  const [sections, setSections] = useState<SectionInstance[]>(() =>
    normalizeSections(props.initialState.sections),
  );
  const [fileOverrides, setFileOverrides] = useState<Record<string, string>>(
    props.initialState.fileOverrides ?? {},
  );
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(props.previewUrl);
  const [startingPreview, setStartingPreview] = useState(false);
  // Bumped after a push to force-remount the iframe so the dev server re-renders
  // the freshly-synced files instead of the stale contentEditable DOM.
  const [iframeNonce, setIframeNonce] = useState(0);

  const [pushOpen, setPushOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // Shared editor state (selection / layers tree / undo history).
  const selection = useEditorStore((s) => s.selection);
  const tree = useEditorStore((s) => s.tree);
  const setSelection = useEditorStore((s) => s.setSelection);
  const setTree = useEditorStore((s) => s.setTree);
  const canUndo = useEditorStore((s) => s.canUndo);
  const canRedo = useEditorStore((s) => s.canRedo);

  const pendingCount = useMemo(
    () =>
      Object.values(pending).reduce((n, f) => n + Object.keys(f).length, 0) +
      Object.keys(textEdits).length +
      sections.length +
      Object.keys(fileOverrides).length,
    [pending, textEdits, sections, fileOverrides],
  );

  // Latest state in refs so the debounced persist never reads stale closures.
  const pendingRef = useRef(pending);
  const textEditsRef = useRef(textEdits);
  const sectionsRef = useRef<SectionInstance[]>(sections);
  const overridesRef = useRef(fileOverrides);
  pendingRef.current = pending;
  textEditsRef.current = textEdits;
  sectionsRef.current = sections;
  overridesRef.current = fileOverrides;
  // When "Add below" was used on a section, the next added section is inserted
  // right after this instance key (else appended).
  const addBelowAfterKey = useRef<string | null>(null);

  const body = useCallback(
    () => ({
      pending: pendingRef.current,
      textEdits: textEditsRef.current,
      sections: sectionsRef.current,
      fileOverrides: overridesRef.current,
      activeFile,
    }),
    [activeFile],
  );

  // Debounced autosave of editor state. `syncSandbox` pushes field/section edits
  // into the sandbox; click-to-edit text already shows live, so it skips sync.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persist = useCallback(
    (syncSandbox: boolean) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        await fetch(`/api/sites/${props.siteId}/editor`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body()),
        }).catch(() => {});
        if (syncSandbox && previewUrl) {
          fetch(`/api/sites/${props.siteId}/preview/sync`, {
            method: "POST",
          }).catch(() => {});
        }
      }, 800);
    },
    [props.siteId, previewUrl, body],
  );

  const post = useCallback((msg: Record<string, unknown>) => {
    iframeRef.current?.contentWindow?.postMessage(
      { source: "site-editor", ...msg },
      "*",
    );
  }, []);

  // ── Undo/redo: record the pre-change snapshot whenever edit-state changes,
  //    skipping changes we apply ourselves during time travel.
  const snapshot = useCallback(
    (): Snapshot => ({
      pending: pendingRef.current,
      textEdits: textEditsRef.current,
      sections: sectionsRef.current,
      fileOverrides: overridesRef.current,
    }),
    [],
  );
  const prevSnap = useRef<Snapshot>(snapshot());
  const timeTraveling = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      prevSnap.current = snapshot();
      return;
    }
    if (timeTraveling.current) {
      timeTraveling.current = false;
    } else {
      useEditorStore.getState().record(prevSnap.current);
    }
    prevSnap.current = snapshot();
  }, [pending, textEdits, sections, fileOverrides, snapshot]);

  const applySnapshot = useCallback(
    (s: Snapshot) => {
      timeTraveling.current = true;
      setPending(s.pending);
      setTextEdits(s.textEdits);
      setSections(s.sections);
      setFileOverrides(s.fileOverrides);
      pendingRef.current = s.pending;
      textEditsRef.current = s.textEdits;
      sectionsRef.current = s.sections;
      overridesRef.current = s.fileOverrides;
      persist(true);
      setIframeNonce((n) => n + 1); // reload preview to reflect reverted source
    },
    [persist],
  );
  const undo = useCallback(() => {
    const s = useEditorStore.getState().undo(snapshot());
    if (s) applySnapshot(s);
  }, [snapshot, applySnapshot]);
  const redo = useCallback(() => {
    const s = useEditorStore.getState().redo(snapshot());
    if (s) applySnapshot(s);
  }, [snapshot, applySnapshot]);

  // ── Inspector / structural edit on the selected element via its data-sx-id.
  const onPatch = useCallback(
    async (patch: Patch) => {
      const sel = useEditorStore.getState().selection;
      if (!sel?.sxId) return;
      // Instant feedback for class changes, and keep the inspector's reading of
      // the current classes in sync before the sandbox recompiles.
      if (patch.kind === "classes") {
        const next = mergeClasses(sel.classes.join(" "), patch.group, patch.token);
        post({ type: "applyClasses", sxId: sel.sxId, className: next });
        setSelection({ ...sel, classes: next.split(/\s+/).filter(Boolean) });
      }
      try {
        const res = await fetch(`/api/sites/${props.siteId}/node-edit`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sxId: sel.sxId, patch }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Edit failed");
        setFileOverrides((prev) => {
          const nextO = { ...prev, [data.file]: data.content };
          overridesRef.current = nextO;
          return nextO;
        });
      } catch (err) {
        setStatus(err instanceof Error ? err.message : "Couldn't apply edit");
      }
    },
    [props.siteId, post, setSelection],
  );

  // Reorder staged sections to a new key order (from the Layers drag).
  function reorderSections(orderedKeys: string[]) {
    const byKey = new Map(sectionsRef.current.map((s) => [s.key, s]));
    const next = orderedKeys.map((k) => byKey.get(k)!).filter(Boolean);
    if (next.length !== sectionsRef.current.length) return;
    sectionsRef.current = next;
    setSections(next);
    persist(true);
    setIframeNonce((n) => n + 1);
  }

  function selectInIframe(sxId: string) {
    setEditMode(true);
    post({ type: "selectById", sxId });
  }

  // Receive click-to-edit changes from the preview iframe agent.
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      const d = e.data;
      if (!d || d.source !== "site-editor") return;
      if (d.type === "ready") {
        // Agent (re)loaded — tell it the current edit-mode state.
        iframeRef.current?.contentWindow?.postMessage(
          { source: "site-editor", type: "setEditMode", enabled: editMode },
          "*",
        );
        return;
      }
      if (d.type === "select") {
        setSelection({
          sxId: d.sxId,
          name: d.name,
          tag: d.tag,
          classes: d.classes ?? [],
          text: d.text,
          sectionKey: d.sectionKey,
        });
        // Refresh the layers tree alongside selection.
        post({ type: "getTree" });
        return;
      }
      if (d.type === "tree") {
        setTree(d.nodes ?? []);
        return;
      }
      if (d.type === "add-below") {
        addBelowAfterKey.current = d.afterKey ?? null;
        setMode("explore");
        return;
      }
      if (d.type === "section-remove") {
        removeSection(d.key);
        return;
      }
      if (d.type === "section-move") {
        moveSection(d.key, d.dir);
        return;
      }
      if (d.type === "section-duplicate") {
        duplicateSection(d.key, d.newKey);
        return;
      }
      if (d.type === "section-op") {
        applyElementOp(d.op, d.anchor);
        return;
      }
      if (d.type !== "edit") return;
      const { oldText, newText } = d as { oldText: string; newText: string };
      if (!oldText || oldText === newText) return;
      setTextEdits((prev) => ({ ...prev, [oldText]: newText }));
      persist(false);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
    // applyElementOp is stable enough; re-binding on editMode keeps `ready` correct.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persist, editMode]);

  // Push edit-mode changes into the running preview.
  useEffect(() => {
    iframeRef.current?.contentWindow?.postMessage(
      { source: "site-editor", type: "setEditMode", enabled: editMode },
      "*",
    );
    if (editMode) post({ type: "getTree" });
    else setSelection(null);
  }, [editMode, post, setSelection]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  async function startPreview() {
    setStartingPreview(true);
    setStatus(null);
    try {
      const res = await fetch(`/api/sites/${props.siteId}/preview`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to start preview");
      setPreviewUrl(data.previewUrl);
      // A fresh sandbox is a clean clone of the repo — reapply any staged edits
      // so they survive a reload that had to restart an expired preview.
      fetch(`/api/sites/${props.siteId}/preview/sync`, { method: "POST" }).catch(() => {});
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Error");
    } finally {
      setStartingPreview(false);
    }
  }

  function addSection(id: string) {
    const key = crypto.randomUUID();
    const next = [...sectionsRef.current];
    // Insert after the "Add below" anchor instance, else append.
    const afterKey = addBelowAfterKey.current;
    addBelowAfterKey.current = null;
    const at = afterKey ? next.findIndex((s) => s.key === afterKey) : -1;
    if (at >= 0) next.splice(at + 1, 0, { key, id });
    else next.push({ key, id });
    setSections(next);
    sectionsRef.current = next;
    setMode("build");
    // Instant: draw it straight into the live preview — no API round-trip, no
    // remount, no compile wait. The iframe stays mounted (the gallery is an
    // overlay), so the injected node survives the mode switch. The key tags the
    // wrapper so this exact placement can be edited/removed later.
    iframeRef.current?.contentWindow?.postMessage(
      { source: "site-editor", type: "insertSection", html: getSection(id)?.previewHtml ?? "", key },
      "*",
    );
    setStatus(previewUrl ? "Section added" : "Section staged — start the live preview to see it");
    // Persist + sync the real component file in the background (for reload/
    // publish). Failures don't affect what the user already sees.
    persist(true);
  }

  // Remove a whole staged-section instance by key (the agent reports this when
  // the user deletes a section's root). Drops it from the list and re-syncs, so
  // the home page is rewritten without its tag and its file stops being written.
  function removeSection(key: string) {
    const next = sectionsRef.current.filter((s) => s.key !== key);
    sectionsRef.current = next;
    setSections(next);
    setStatus("Section removed");
    persist(true);
  }

  // Reorder a section instance (the agent already swapped the DOM wrappers).
  function moveSection(key: string, dir: "move-up" | "move-down") {
    const arr = [...sectionsRef.current];
    const i = arr.findIndex((s) => s.key === key);
    const j = dir === "move-up" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    sectionsRef.current = arr;
    setSections(arr);
    persist(true);
  }

  // Duplicate a section: a fresh instance (new key, same catalog id) right after
  // the original. The agent already cloned the DOM with the new key.
  function duplicateSection(key: string, newKey: string) {
    const arr = [...sectionsRef.current];
    const i = arr.findIndex((s) => s.key === key);
    if (i < 0) return;
    arr.splice(i + 1, 0, { key: newKey, id: arr[i].id });
    sectionsRef.current = arr;
    setSections(arr);
    setStatus("Section duplicated");
    persist(true);
  }

  // In-preview structural op (reorder/duplicate/delete). The agent already
  // mutated the live DOM for instant feedback; here we persist in the background
  // — rewrite source, store the override locally (so autosave won't clobber it
  // and Push ships it). No reload; Fast Refresh reconciles the canonical render.
  async function applyElementOp(op: string, anchor: string) {
    try {
      const res = await fetch(`/api/sites/${props.siteId}/section-op`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ op, anchor }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Op failed");
      setFileOverrides((prev) => {
        const next = { ...prev, [data.file]: data.content };
        overridesRef.current = next;
        return next;
      });
    } catch {
      setStatus("Couldn't save this change");
    }
  }

  // Save = flush the draft to the DB now (no git).
  async function saveDraft() {
    setSaving(true);
    setStatus(null);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    try {
      await fetch(`/api/sites/${props.siteId}/editor`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body()),
      });
      // Sync into the sandbox too, so a reload renders the saved edits from
      // source (text edits otherwise live only in the iframe DOM and revert).
      if (previewUrl) {
        await fetch(`/api/sites/${props.siteId}/preview/sync`, { method: "POST" });
      }
      setStatus("Saved");
    } catch {
      setStatus("Save failed");
    } finally {
      setSaving(false);
    }
  }

  // After a push the edits are committed and cleared server-side.
  function onPushed(msg: string) {
    setPending({});
    setTextEdits({});
    setSections([]);
    setFileOverrides({});
    pendingRef.current = {};
    textEditsRef.current = {};
    sectionsRef.current = [];
    overridesRef.current = {};
    useEditorStore.getState().resetHistory();
    setSelection(null);
    setIframeNonce((n) => n + 1);
    setStatus(msg);
  }

  const showPreview = Boolean(previewUrl);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-zinc-950">
      <Toolbar
        siteId={props.siteId}
        pageName={props.siteName}
        mode={mode}
        onMode={setMode}
        device={device}
        onDevice={setDevice}
        hasDeployed={props.hasDeployed}
        saving={saving}
        pendingCount={pendingCount}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={undo}
        onRedo={redo}
        onPreview={() => previewUrl && window.open(previewUrl, "_blank")}
        onHistory={() => setHistoryOpen(true)}
        onPush={() => setPushOpen(true)}
        onSave={saveDraft}
        onPublish={() => setPublishOpen(true)}
      />

      {!props.imported && (
        <div className="bg-amber-500/10 px-4 py-2 text-sm text-amber-300">
          This project hasn&apos;t been imported yet. Run the import from{" "}
          <Link
            href={`/dashboard/sites/${props.siteId}/settings`}
            className="underline"
          >
            settings
          </Link>{" "}
          to scan components.
        </div>
      )}

      <div className="relative min-h-0 flex-1">
        {/* Preview stays mounted always; the gallery overlays it (below) so an
            instantly-injected section survives the explore→build switch. */}
        {
          <div className="flex h-full">
            {/* Left panel: Elements + Layers */}
            <aside className="hidden w-60 shrink-0 border-r border-zinc-800 bg-zinc-950 md:block">
              <LeftPanel
                sections={sections}
                tree={tree}
                selectedSxId={selection?.sxId ?? null}
                onAdd={addSection}
                onSelect={selectInIframe}
                onReorderSections={reorderSections}
              />
            </aside>

            {/* Preview */}
            <main className="relative min-w-0 flex-1 bg-zinc-900">
              {showPreview ? (
                <div
                  className={cn(
                    "mx-auto h-full bg-white transition-[max-width]",
                    device === "mobile"
                      ? "max-w-[390px]"
                      : device === "tablet"
                        ? "max-w-[820px]"
                        : "max-w-none",
                  )}
                >
                  <iframe
                    key={iframeNonce}
                    ref={iframeRef}
                    src={previewUrl!}
                    className="h-full w-full border-0"
                    title="Live preview"
                    onLoad={() =>
                      iframeRef.current?.contentWindow?.postMessage(
                        { source: "site-editor", type: "setEditMode", enabled: editMode },
                        "*",
                      )
                    }
                  />
                </div>
              ) : (
                <div className="flex h-full items-center justify-center p-8 text-center text-sm text-zinc-400">
                  <div className="space-y-3">
                    <p className="font-medium text-zinc-200">
                      Live preview not running
                    </p>
                    <p className="max-w-md">
                      Spin up an isolated E2B sandbox that clones your repo,
                      installs deps and runs the dev server. Then hit Edit to tweak
                      any text inline.
                    </p>
                    <Button
                      onClick={startPreview}
                      disabled={startingPreview || !props.imported}
                    >
                      {startingPreview ? "Starting sandbox…" : "Start live preview"}
                    </Button>
                  </div>
                </div>
              )}

              {/* Floating Edit toggle */}
              {showPreview && (
                <button
                  onClick={() => setEditMode((v) => !v)}
                  className={cn(
                    "absolute right-4 top-4 inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium shadow-lg transition-colors",
                    editMode
                      ? "border-orange-500 bg-orange-500 text-white"
                      : "border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-100",
                  )}
                >
                  <Pencil className="size-4" />
                  {editMode ? "Editing" : "Edit"}
                </button>
              )}
            </main>

            {/* Right panel: Styles inspector */}
            <aside className="hidden w-72 shrink-0 border-l border-zinc-800 bg-zinc-950 text-zinc-100 lg:block">
              <RightInspector selection={selection} onPatch={onPatch} />
            </aside>
          </div>
        }

        {/* Section gallery — overlays the live preview so adding a section can
            inject straight into the still-mounted iframe. */}
        {mode === "explore" && (
          <div className="absolute inset-0 z-20 overflow-auto bg-zinc-950">
            <SectionGallery onAdd={addSection} />
          </div>
        )}

        {/* Transient status toast */}
        {status && (
          <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-zinc-800 px-4 py-2 text-sm text-zinc-100 shadow-lg">
            {status}
          </div>
        )}
      </div>

      <PushDialog
        open={pushOpen}
        onOpenChange={setPushOpen}
        siteId={props.siteId}
        repositoryName={props.repositoryName}
        branch={props.branch}
        onDone={onPushed}
      />
      <PublishDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        siteId={props.siteId}
        hasDeployed={props.hasDeployed}
        onDone={setStatus}
      />
      <HistoryDialog
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        deployments={props.deployments}
      />
    </div>
  );
}

