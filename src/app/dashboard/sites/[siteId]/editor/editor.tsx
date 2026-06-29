"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Pencil, X } from "lucide-react";
import type { ProjectMetadata, ScannedComponent } from "@/lib/import/component-scanner";
import type { EditorState } from "@/lib/editor/types";
import type { DeploymentStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Toolbar, type EditorMode, type Device } from "./toolbar";
import { SectionGallery } from "./section-gallery";
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

  const [activeFile, setActiveFile] = useState<string | null>(
    metadata.components[0]?.filePath ?? null,
  );
  const [pending, setPending] = useState<EditorState["pending"]>(
    props.initialState.pending ?? {},
  );
  const [textEdits, setTextEdits] = useState<Record<string, string>>(
    props.initialState.textEdits ?? {},
  );
  const [sections, setSections] = useState<string[]>(
    props.initialState.sections ?? [],
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

  const activeComponent = useMemo(
    () => metadata.components.find((c) => c.filePath === activeFile) ?? null,
    [metadata.components, activeFile],
  );

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
  const sectionsRef = useRef(sections);
  const overridesRef = useRef(fileOverrides);
  pendingRef.current = pending;
  textEditsRef.current = textEdits;
  sectionsRef.current = sections;
  overridesRef.current = fileOverrides;

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
      if (d.type === "add-below") {
        setMode("explore");
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
  }, [editMode]);

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
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Error");
    } finally {
      setStartingPreview(false);
    }
  }

  function setField(filePath: string, field: string, value: string) {
    setPending((prev) => {
      const next = { ...prev, [filePath]: { ...prev[filePath], [field]: value } };
      pendingRef.current = next;
      persist(true);
      return next;
    });
  }

  function addSection(id: string) {
    setSections((prev) => {
      const next = [...prev, id];
      sectionsRef.current = next;
      persist(true);
      return next;
    });
    setMode("build");
    setStatus("Section added — appearing in your preview");
  }

  // In-preview structural op (reorder/duplicate/delete). The endpoint rewrites
  // the source, persists a file override and writes it into the sandbox; we
  // mirror the override locally (so autosave won't clobber it) and reload.
  async function applyElementOp(op: string, anchor: string) {
    setStatus("Applying…");
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
      setIframeNonce((n) => n + 1);
      setStatus(`Updated ${data.file}`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Error");
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
        {mode === "explore" ? (
          <SectionGallery added={sections} onAdd={addSection} />
        ) : (
          <div className="flex h-full">
            {/* Preview */}
            <main className="relative min-w-0 flex-1 bg-zinc-900">
              {showPreview ? (
                <div
                  className={cn(
                    "mx-auto h-full bg-white transition-[max-width]",
                    device === "mobile" ? "max-w-[390px]" : "max-w-none",
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

            {/* Inspector drawer — only while editing */}
            {editMode && (
              <aside className="w-80 shrink-0 overflow-y-auto border-l border-zinc-800 bg-zinc-950 p-4 text-zinc-200">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-sm font-semibold">Edit content</h2>
                  <button
                    onClick={() => setEditMode(false)}
                    className="text-zinc-500 hover:text-zinc-200"
                  >
                    <X className="size-4" />
                  </button>
                </div>

                {Object.keys(textEdits).length > 0 && (
                  <div className="mb-4">
                    <h3 className="mb-2 text-xs font-semibold uppercase text-zinc-400">
                      Click-to-edit ({Object.keys(textEdits).length})
                    </h3>
                    <ul className="space-y-1.5">
                      {Object.entries(textEdits).map(([from, to]) => (
                        <li
                          key={from}
                          className="flex items-start gap-2 rounded border border-zinc-800 px-2 py-1.5 text-xs"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-zinc-500 line-through">
                              {from}
                            </span>
                            <span className="block truncate">{to}</span>
                          </span>
                          <button
                            className="text-zinc-500 hover:text-zinc-200"
                            title="Drop this edit from the next push"
                            onClick={() => {
                              setTextEdits((prev) => {
                                const next = { ...prev };
                                delete next[from];
                                textEditsRef.current = next;
                                persist(false);
                                return next;
                              });
                            }}
                          >
                            ✕
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {metadata.components.length > 0 && (
                  <div className="mb-3">
                    <Label className="text-xs uppercase text-zinc-400">
                      Component
                    </Label>
                    <select
                      value={activeFile ?? ""}
                      onChange={(e) => setActiveFile(e.target.value)}
                      className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm"
                    >
                      {metadata.components.map((c) => (
                        <option key={c.filePath} value={c.filePath}>
                          {c.name} ({c.editableFields.length})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {activeComponent ? (
                  <Inspector
                    component={activeComponent}
                    values={pending[activeComponent.filePath] ?? {}}
                    onChange={(field, value) =>
                      setField(activeComponent.filePath, field, value)
                    }
                  />
                ) : (
                  <p className="text-sm text-zinc-500">
                    No editable components. Click text in the preview to edit it
                    inline.
                  </p>
                )}
              </aside>
            )}
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

function Inspector({
  component,
  values,
  onChange,
}: {
  component: ScannedComponent;
  values: Record<string, string>;
  onChange: (field: string, value: string) => void;
}) {
  if (component.editableFields.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        This component exposes no editable fields.
      </p>
    );
  }
  return (
    <div className="space-y-4">
      {component.editableFields.map((field) => {
        const value = values[field.name] ?? "";
        return (
          <div key={field.name} className="space-y-1.5">
            <Label htmlFor={field.name} className="capitalize">
              {field.name}
            </Label>
            {field.type === "textarea" ? (
              <Textarea
                id={field.name}
                value={value}
                placeholder={`Edit ${field.name}…`}
                className="border-zinc-700 bg-zinc-900"
                onChange={(e) => onChange(field.name, e.target.value)}
              />
            ) : field.type === "boolean" ? (
              <input
                id={field.name}
                type="checkbox"
                checked={value === "true"}
                onChange={(e) =>
                  onChange(field.name, e.target.checked ? "true" : "false")
                }
              />
            ) : (
              <Input
                id={field.name}
                type={field.type === "number" ? "number" : "text"}
                value={value}
                className="border-zinc-700 bg-zinc-900"
                placeholder={
                  field.type === "image" ? "https://… or /public path" : ""
                }
                onChange={(e) => onChange(field.name, e.target.value)}
              />
            )}
            <p className="text-[10px] uppercase text-zinc-500">{field.type}</p>
          </div>
        );
      })}
    </div>
  );
}
