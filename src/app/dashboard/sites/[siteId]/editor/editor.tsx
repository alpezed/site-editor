"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  FileText,
  Component as ComponentIcon,
  Image as ImageIcon,
  GitBranch,
  ArrowLeft,
  UploadCloud,
} from "lucide-react";
import type { ProjectMetadata, ScannedComponent } from "@/lib/import/component-scanner";
import type { EditorState } from "@/lib/editor/types";
import type { DeploymentStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Tab = "pages" | "components" | "assets";

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
}

export function Editor(props: Props) {
  const { metadata } = props;
  const [tab, setTab] = useState<Tab>("components");
  const [activeFile, setActiveFile] = useState<string | null>(
    metadata.components[0]?.filePath ?? null,
  );
  const [pending, setPending] = useState<EditorState["pending"]>(
    props.initialState.pending ?? {},
  );
  const [textEdits, setTextEdits] = useState<Record<string, string>>(
    props.initialState.textEdits ?? {},
  );
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(props.previewUrl);
  const [startingPreview, setStartingPreview] = useState(false);
  // Bumped after publish to force-remount the iframe so the dev server re-renders
  // the freshly-synced files instead of the stale contentEditable DOM.
  const [iframeNonce, setIframeNonce] = useState(0);

  const activeComponent = useMemo(
    () => metadata.components.find((c) => c.filePath === activeFile) ?? null,
    [metadata.components, activeFile],
  );

  const pendingCount = useMemo(
    () =>
      Object.values(pending).reduce((n, f) => n + Object.keys(f).length, 0) +
      Object.keys(textEdits).length,
    [pending, textEdits],
  );

  // Latest state in refs so the debounced persist never reads stale closures.
  const pendingRef = useRef(pending);
  const textEditsRef = useRef(textEdits);
  pendingRef.current = pending;
  textEditsRef.current = textEdits;

  // Debounced autosave of editor state. `syncSandbox` is for field edits, which
  // must be pushed into the sandbox; click-to-edit text already shows live in
  // the iframe, so it skips the sync.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persist = useCallback(
    (syncSandbox: boolean) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        await fetch(`/api/sites/${props.siteId}/editor`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            pending: pendingRef.current,
            textEdits: textEditsRef.current,
            activeFile,
          }),
        }).catch(() => {});
        if (syncSandbox && previewUrl) {
          fetch(`/api/sites/${props.siteId}/preview/sync`, {
            method: "POST",
          }).catch(() => {});
        }
      }, 800);
    },
    [props.siteId, activeFile, previewUrl],
  );

  // Receive click-to-edit changes from the preview iframe agent.
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      const d = e.data;
      if (!d || d.source !== "site-editor" || d.type !== "edit") return;
      const { oldText, newText } = d as { oldText: string; newText: string };
      if (!oldText || oldText === newText) return;
      setTextEdits((prev) => ({ ...prev, [oldText]: newText }));
      persist(false);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [persist]);

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
      const next = {
        ...prev,
        [filePath]: { ...prev[filePath], [field]: value },
      };
      pendingRef.current = next;
      persist(true);
      return next;
    });
  }

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  async function publish() {
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch(`/api/sites/${props.siteId}/save`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setPending({});
      setTextEdits({});
      setIframeNonce((n) => n + 1);
      setStatus(
        `Committed ${data.commitHash?.slice(0, 7)} · ${data.filesChanged} file(s) · deploying`,
      );
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex h-screen flex-col">
      {/* Top bar */}
      <header className="flex items-center gap-3 border-b px-4 py-2">
        <Button asChild variant="ghost" size="sm">
          <Link href={`/dashboard/sites/${props.siteId}`}>
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-sm font-semibold">{props.siteName}</h1>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <GitBranch className="size-3" />
            {props.repositoryName}@{props.branch}
          </p>
        </div>
        <Button onClick={publish} disabled={saving || pendingCount === 0}>
          <UploadCloud className="size-4" />
          {saving ? "Publishing…" : `Save & Publish${pendingCount ? ` (${pendingCount})` : ""}`}
        </Button>
      </header>

      {!props.imported && (
        <div className="bg-amber-50 px-4 py-2 text-sm text-amber-800">
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

      {/* Three columns */}
      <div className="flex min-h-0 flex-1">
        {/* Left */}
        <aside className="flex w-64 shrink-0 flex-col border-r">
          <div className="flex border-b text-xs">
            <TabButton active={tab === "pages"} onClick={() => setTab("pages")}>
              <FileText className="size-3.5" /> Pages
            </TabButton>
            <TabButton
              active={tab === "components"}
              onClick={() => setTab("components")}
            >
              <ComponentIcon className="size-3.5" /> Components
            </TabButton>
            <TabButton active={tab === "assets"} onClick={() => setTab("assets")}>
              <ImageIcon className="size-3.5" /> Assets
            </TabButton>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2 text-sm">
            {tab === "pages" && (
              <ul className="space-y-0.5">
                {metadata.routes.map((r) => (
                  <li
                    key={r.filePath}
                    className="rounded px-2 py-1.5 text-muted-foreground"
                  >
                    <span className="font-mono text-xs">{r.routePath}</span>
                    <span className="ml-1 text-[10px] uppercase opacity-60">
                      {r.kind}
                    </span>
                  </li>
                ))}
                {metadata.routes.length === 0 && (
                  <Empty>No routes detected.</Empty>
                )}
              </ul>
            )}
            {tab === "components" && (
              <ul className="space-y-0.5">
                {metadata.components.map((c) => (
                  <li key={c.filePath}>
                    <button
                      onClick={() => setActiveFile(c.filePath)}
                      className={cn(
                        "w-full rounded px-2 py-1.5 text-left hover:bg-accent",
                        activeFile === c.filePath && "bg-accent font-medium",
                      )}
                    >
                      {c.name}
                      <span className="ml-1 text-[10px] text-muted-foreground">
                        {c.editableFields.length} fields
                      </span>
                    </button>
                  </li>
                ))}
                {metadata.components.length === 0 && (
                  <Empty>
                    No editable components. Add{" "}
                    <code className="text-[11px]">export const editor</code> to
                    a component.
                  </Empty>
                )}
              </ul>
            )}
            {tab === "assets" && (
              <ul className="space-y-0.5">
                {metadata.assets.map((a) => (
                  <li
                    key={a}
                    className="truncate rounded px-2 py-1.5 font-mono text-xs text-muted-foreground"
                  >
                    {a}
                  </li>
                ))}
                {metadata.assets.length === 0 && <Empty>No assets found.</Empty>}
              </ul>
            )}
          </div>
        </aside>

        {/* Center: live preview */}
        <main className="min-w-0 flex-1 bg-muted/30">
          {previewUrl ? (
            <iframe
              key={iframeNonce}
              src={previewUrl}
              className="h-full w-full border-0 bg-white"
              title="Live preview"
            />
          ) : (
            <div className="flex h-full items-center justify-center p-8 text-center text-sm text-muted-foreground">
              <div className="space-y-3">
                <p className="font-medium">Live preview not running</p>
                <p>
                  Spin up an isolated E2B sandbox that clones your repo, installs
                  deps and runs the dev server. Then click any text on the page
                  to edit it inline.
                </p>
                <Button onClick={startPreview} disabled={startingPreview || !props.imported}>
                  {startingPreview ? "Starting sandbox…" : "Start live preview"}
                </Button>
                {!props.imported && (
                  <p className="text-xs">Import the project first.</p>
                )}
              </div>
            </div>
          )}
        </main>

        {/* Right: inspector */}
        <aside className="w-80 shrink-0 overflow-y-auto border-l p-4">
          {Object.keys(textEdits).length > 0 && (
            <div className="mb-4">
              <h2 className="mb-2 text-sm font-semibold">
                Content edits ({Object.keys(textEdits).length})
              </h2>
              <ul className="space-y-1.5">
                {Object.entries(textEdits).map(([from, to]) => (
                  <li
                    key={from}
                    className="flex items-start gap-2 rounded border px-2 py-1.5 text-xs"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-muted-foreground line-through">
                        {from}
                      </span>
                      <span className="block truncate">{to}</span>
                    </span>
                    <button
                      className="text-muted-foreground hover:text-foreground"
                      title="Drop this edit from publish"
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
              <p className="mt-1.5 text-[10px] text-muted-foreground">
                Click text in the preview to edit. Reverting here drops it from
                the next publish (reload preview to undo visually).
              </p>
            </div>
          )}
          <h2 className="mb-3 text-sm font-semibold">Properties</h2>
          {activeComponent ? (
            <Inspector
              component={activeComponent}
              values={pending[activeComponent.filePath] ?? {}}
              onChange={(field, value) =>
                setField(activeComponent.filePath, field, value)
              }
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              Select a component to edit its fields.
            </p>
          )}
        </aside>
      </div>

      {/* Bottom bar: git + deployment status */}
      <footer className="flex items-center gap-4 border-t px-4 py-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <GitBranch className="size-3" />
          {pendingCount === 0
            ? "No pending changes"
            : `${pendingCount} pending change${pendingCount === 1 ? "" : "s"}`}
        </span>
        <span>·</span>
        <span className="flex items-center gap-1">
          Deployment:{" "}
          {props.latestDeploymentStatus ? (
            <Badge variant="secondary">{props.latestDeploymentStatus}</Badge>
          ) : (
            "none"
          )}
        </span>
        {status && (
          <span className="ml-auto text-foreground">{status}</span>
        )}
      </footer>
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
      <p className="text-sm text-muted-foreground">
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
                placeholder={
                  field.type === "image" ? "https://… or /public path" : ""
                }
                onChange={(e) => onChange(field.name, e.target.value)}
              />
            )}
            <p className="text-[10px] uppercase text-muted-foreground">
              {field.type}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-1 items-center justify-center gap-1 py-2 hover:bg-accent",
        active && "border-b-2 border-foreground font-medium",
      )}
    >
      {children}
    </button>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-2 py-4 text-xs text-muted-foreground">{children}</p>;
}
