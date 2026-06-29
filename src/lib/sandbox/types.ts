export interface Sandbox {
  id: string;
  previewUrl: string;
}

export interface SandboxDriver {
  /** Create a sandbox from a git repo + branch and start the dev server. */
  create(opts: {
    repoFullName: string;
    branch: string;
    accessToken: string;
  }): Promise<Sandbox>;
  /** Write changed files into a running sandbox (triggers hot reload). */
  writeFiles(
    sandboxId: string,
    files: { path: string; content: string }[],
  ): Promise<void>;
  /** Recent console output from the dev server. */
  logs(sandboxId: string): Promise<string[]>;
  /** Whether the sandbox still exists (they expire on inactivity timeout). */
  isAlive(sandboxId: string): Promise<boolean>;
  /** Tear down the sandbox. */
  destroy(sandboxId: string): Promise<void>;
}
