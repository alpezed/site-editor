"use client";

import Link from "next/link";
import {
  ArrowLeft,
  Compass,
  Layers,
  Monitor,
  Tablet,
  Smartphone,
  Eye,
  Settings,
  History,
  GitBranch,
  Save,
  Rocket,
  Loader2,
  Undo2,
  Redo2,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type EditorMode = "explore" | "build";
export type Device = "desktop" | "tablet" | "mobile";

export function Toolbar({
  siteId,
  pageName,
  mode,
  onMode,
  device,
  onDevice,
  hasDeployed,
  saving,
  pendingCount,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onPreview,
  onHistory,
  onPush,
  onSave,
  onPublish,
}: {
  siteId: string;
  pageName: string;
  mode: EditorMode;
  onMode: (m: EditorMode) => void;
  device: Device;
  onDevice: (d: Device) => void;
  hasDeployed: boolean;
  saving: boolean;
  pendingCount: number;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onPreview: () => void;
  onHistory: () => void;
  onPush: () => void;
  onSave: () => void;
  onPublish: () => void;
}) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-zinc-800 bg-zinc-950 px-3 text-zinc-300">
      <Link
        href={`/dashboard/sites/${siteId}`}
        className="rounded-md p-1.5 hover:bg-zinc-800 hover:text-zinc-100"
      >
        <ArrowLeft className="size-4" />
      </Link>
      <span className="mr-2 font-semibold text-zinc-100">{pageName}</span>

      <div className="flex flex-1 items-center justify-center gap-1.5">
        {/* Mode segmented control */}
        <div className="flex items-center rounded-full bg-zinc-900 p-0.5">
          <Tab active={mode === "explore"} onClick={() => onMode("explore")}>
            <Compass className="size-4" /> Explore
          </Tab>
          <Tab active={mode === "build"} onClick={() => onMode("build")}>
            <Layers className="size-4" /> Build
          </Tab>
        </div>

        {/* Device toggle */}
        <div className="flex items-center rounded-full bg-zinc-900 p-0.5">
          <IconToggle active={device === "desktop"} onClick={() => onDevice("desktop")}>
            <Monitor className="size-4" />
          </IconToggle>
          <IconToggle active={device === "tablet"} onClick={() => onDevice("tablet")}>
            <Tablet className="size-4" />
          </IconToggle>
          <IconToggle active={device === "mobile"} onClick={() => onDevice("mobile")}>
            <Smartphone className="size-4" />
          </IconToggle>
        </div>

        {/* Undo / redo */}
        <div className="flex items-center rounded-full bg-zinc-900 p-0.5">
          <button
            onClick={onUndo}
            disabled={!canUndo}
            title="Undo"
            className="rounded-full p-1.5 text-zinc-400 enabled:hover:text-zinc-100 disabled:opacity-30"
          >
            <Undo2 className="size-4" />
          </button>
          <button
            onClick={onRedo}
            disabled={!canRedo}
            title="Redo"
            className="rounded-full p-1.5 text-zinc-400 enabled:hover:text-zinc-100 disabled:opacity-30"
          >
            <Redo2 className="size-4" />
          </button>
        </div>

        <PillButton onClick={onPreview}>
          <Eye className="size-4" /> Preview
        </PillButton>
        <Link
          href={`/dashboard/sites/${siteId}/settings`}
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
        >
          <Settings className="size-4" /> Site settings
        </Link>
        <PillButton onClick={onHistory}>
          <History className="size-4" /> History
        </PillButton>
        <PillButton onClick={onPush}>
          <GitBranch className="size-4" /> Push
        </PillButton>
      </div>

      <button
        onClick={onSave}
        disabled={saving}
        className="inline-flex items-center gap-1.5 rounded-full border border-orange-500 px-4 py-1.5 text-sm font-medium text-orange-400 transition-colors hover:bg-orange-500/10 disabled:opacity-60"
      >
        {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
        Save{pendingCount ? ` (${pendingCount})` : ""}
      </button>
      <button
        onClick={onPublish}
        className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500 px-4 py-1.5 text-sm font-semibold text-emerald-950 transition-colors hover:bg-emerald-400"
      >
        <Rocket className="size-4" />
        {hasDeployed ? "Republish" : "Publish"}
      </button>
    </header>
  );
}

function Tab({
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
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-colors",
        active
          ? "bg-zinc-700 text-zinc-100"
          : "text-zinc-400 hover:text-zinc-200",
      )}
    >
      {children}
    </button>
  );
}

function IconToggle({
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
        "rounded-full p-1.5 transition-colors",
        active ? "bg-zinc-700 text-zinc-100" : "text-zinc-500 hover:text-zinc-200",
      )}
    >
      {children}
    </button>
  );
}

function PillButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
    >
      {children}
    </button>
  );
}
