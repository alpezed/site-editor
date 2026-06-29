"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Github, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface Repo {
  id: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  private: boolean;
}

interface Props {
  siteId: string;
  githubConnected: boolean;
  githubUsername: string | null;
  connectGithubAction: () => Promise<void>;
  disconnectGithubAction: () => Promise<void>;
  repository: {
    repositoryName: string;
    branch: string;
    framework: string | null;
    imported: boolean;
  } | null;
}

export function RepositorySettings({
  siteId,
  githubConnected,
  githubUsername,
  connectGithubAction,
  disconnectGithubAction,
  repository,
}: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<string>("");
  const [branch, setBranch] = useState("main");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reposQuery = useQuery({
    queryKey: ["repos"],
    enabled: githubConnected && !repository,
    queryFn: async (): Promise<Repo[]> => {
      const res = await fetch("/api/github/repositories");
      if (!res.ok) throw new Error("Failed to load repositories");
      const data = await res.json();
      return data.repositories;
    },
  });

  async function connectRepo() {
    const repo = reposQuery.data?.find((r) => r.id === selected);
    if (!repo) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/sites/${siteId}/repository`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          repositoryId: repo.id,
          repositoryName: repo.fullName,
          branch: branch || repo.defaultBranch,
          defaultBranch: repo.defaultBranch,
        }),
      });
      if (!res.ok) throw new Error("Failed to connect repository");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function runImport() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/sites/${siteId}/import`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.reason ?? data.error ?? "Import failed");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function disconnectRepo() {
    setBusy(true);
    await fetch(`/api/sites/${siteId}/repository`, { method: "DELETE" });
    router.refresh();
    setBusy(false);
  }

  // ── Repository already connected ──────────────────────────────────────────
  if (repository) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Github className="size-4" /> {repository.repositoryName}
            </CardTitle>
            {repository.imported ? (
              <Badge variant="success">Imported · {repository.framework}</Badge>
            ) : (
              <Badge variant="warning">Not imported</Badge>
            )}
          </div>
          <CardDescription>Branch: {repository.branch}</CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Button onClick={runImport} disabled={busy}>
            <RefreshCw className="size-4" />
            {repository.imported ? "Re-scan project" : "Import project"}
          </Button>
          <Button variant="outline" onClick={disconnectRepo} disabled={busy}>
            Disconnect
          </Button>
          {error && <p className="self-center text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>
    );
  }

  // ── GitHub not connected ──────────────────────────────────────────────────
  if (!githubConnected) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Repository</CardTitle>
          <CardDescription>
            Connect your GitHub account first (one-time setup).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={connectGithubAction}>
            <Button>
              <Github className="size-4" /> Connect GitHub
            </Button>
          </form>
        </CardContent>
      </Card>
    );
  }

  // ── GitHub connected, choose a repository ─────────────────────────────────
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Choose repository</CardTitle>
          <form action={disconnectGithubAction}>
            <Button variant="ghost" size="sm" type="submit">
              Disconnect GitHub
            </Button>
          </form>
        </div>
        <CardDescription>
          Connected as @{githubUsername}. One repository per site.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {reposQuery.isLoading && (
          <p className="text-sm text-muted-foreground">Loading repositories…</p>
        )}
        {reposQuery.isError && (
          <p className="text-sm text-destructive">
            Could not load repositories.
          </p>
        )}
        {reposQuery.data && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="repo">Repository</Label>
              <select
                id="repo"
                value={selected}
                onChange={(e) => {
                  setSelected(e.target.value);
                  const r = reposQuery.data.find((x) => x.id === e.target.value);
                  if (r) setBranch(r.defaultBranch);
                }}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              >
                <option value="">Select a repository…</option>
                {reposQuery.data.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.fullName}
                    {r.private ? " (private)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="branch">Branch</Label>
              <Input
                id="branch"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button onClick={connectRepo} disabled={!selected || busy}>
              Connect
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
