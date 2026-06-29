"use client";

import { useState } from "react";
import { Github, Rocket, Loader2, ExternalLink } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { DeploymentStatus, DeploymentTrigger } from "@prisma/client";

export interface DeploymentLite {
  id: string;
  status: DeploymentStatus;
  trigger: DeploymentTrigger;
  commitHash: string | null;
  url: string | null;
  createdAt: string | Date;
}

/** Push to GitHub — commits pending edits to the branch (POST /save). */
export function PushDialog({
  open,
  onOpenChange,
  siteId,
  repositoryName,
  branch,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  siteId: string;
  repositoryName: string;
  branch: string;
  onDone: (msg: string) => void;
}) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function push() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/sites/${siteId}/save`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(message.trim() ? { message: message.trim() } : {}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Push failed");
      onDone(
        `Pushed ${data.commitHash?.slice(0, 7)} · ${data.filesChanged} file(s) · deploying`,
      );
      setMessage("");
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Github className="size-5" /> Push to GitHub
          </DialogTitle>
          <p className="font-mono text-xs text-zinc-500">
            {repositoryName} · {branch}
          </p>
        </DialogHeader>
        <p className="rounded-lg bg-zinc-800/60 p-4 text-sm text-zinc-300">
          Pushes every edit in your preview — click-to-edit tweaks and sections you
          added from Explore — straight to{" "}
          <code className="font-mono">{branch}</code>. Your live site updates on
          the next deploy.
        </p>
        <div className="space-y-1.5">
          <label className="text-xs font-medium uppercase tracking-wide text-zinc-400">
            Commit message <span className="text-zinc-600">(optional)</span>
          </label>
          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Update hero copy and footer links"
            className="border-zinc-700 bg-zinc-800 text-zinc-100 placeholder:text-zinc-500"
          />
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" className="text-zinc-300 hover:bg-zinc-800">
              Cancel
            </Button>
          </DialogClose>
          <Button
            onClick={push}
            disabled={busy}
            className="bg-emerald-500 text-emerald-950 hover:bg-emerald-400"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Github className="size-4" />}
            Push to {branch}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Publish / Republish — fires a deploy (POST /deploy). */
export function PublishDialog({
  open,
  onOpenChange,
  siteId,
  hasDeployed,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  siteId: string;
  hasDeployed: boolean;
  onDone: (msg: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const verb = hasDeployed ? "Republish" : "Publish";

  async function publish() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/sites/${siteId}/deploy`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ trigger: hasDeployed ? "REDEPLOY" : "MANUAL" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Deploy failed");
      onDone(`${verb}ing — your site will be live in a few seconds`);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-emerald-600/20 text-emerald-400">
              <Rocket className="size-5" />
            </span>
            <div>
              <DialogTitle>{verb} your site</DialogTitle>
              <p className="mt-1 text-sm text-zinc-400">
                Goes live at your site&apos;s URL. Visitors will see the current
                version.
              </p>
            </div>
          </div>
        </DialogHeader>
        <p className="text-sm text-zinc-300">
          {hasDeployed
            ? "Your latest changes will replace the live version. Anyone with your URL will see the new site within a few seconds."
            : "Your site will be reachable at its public URL. You can keep editing — changes won't go live again until you republish."}
        </p>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" className="text-zinc-300 hover:bg-zinc-800">
              Not yet
            </Button>
          </DialogClose>
          <Button
            onClick={publish}
            disabled={busy}
            className="bg-emerald-500 text-emerald-950 hover:bg-emerald-400"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Rocket className="size-4" />}
            {verb} now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** History — list of recent deployments. */
export function HistoryDialog({
  open,
  onOpenChange,
  deployments,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  deployments: DeploymentLite[];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Deployment history</DialogTitle>
        </DialogHeader>
        {deployments.length === 0 ? (
          <p className="py-6 text-center text-sm text-zinc-400">
            No deployments yet. Hit Publish to ship your first version.
          </p>
        ) : (
          <ul className="max-h-96 space-y-1.5 overflow-y-auto">
            {deployments.map((d) => (
              <li
                key={d.id}
                className="flex items-center gap-3 rounded-lg border border-zinc-800 px-3 py-2 text-sm"
              >
                <span className="font-mono text-xs text-zinc-300">
                  {d.commitHash?.slice(0, 7) ?? "—"}
                </span>
                <span className="rounded bg-zinc-800 px-2 py-0.5 text-[10px] uppercase text-zinc-300">
                  {d.status}
                </span>
                <span className="text-xs text-zinc-500">{d.trigger}</span>
                <span className="ml-auto text-xs text-zinc-500">
                  {new Date(d.createdAt).toLocaleString()}
                </span>
                {d.url && (
                  <a
                    href={d.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-zinc-400 hover:text-zinc-100"
                  >
                    <ExternalLink className="size-3.5" />
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
