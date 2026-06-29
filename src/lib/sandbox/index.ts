import { env } from "@/lib/env";

/**
 * Live-preview sandbox abstraction. Each imported project runs in an isolated
 * environment that installs dependencies, runs the dev server with hot reload
 * and exposes a preview URL. Drivers:
 *   - e2b    : E2B cloud sandboxes (preferred)
 *   - docker : self-hosted container
 *   - mock   : no-op driver for local development without credentials
 */

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
  /** Write changed files into a running sandbox (hot reload). */
  writeFiles(
    sandboxId: string,
    files: { path: string; content: string }[],
  ): Promise<void>;
  /** Recent console output. */
  logs(sandboxId: string): Promise<string[]>;
  /** Tear down. */
  destroy(sandboxId: string): Promise<void>;
}

// ── Mock driver ───────────────────────────────────────────────────────────────

const mockDriver: SandboxDriver = {
  async create({ repoFullName }) {
    const id = `mock-${repoFullName.replace(/\W+/g, "-")}`;
    return { id, previewUrl: `${env.appUrl}/preview/mock` };
  },
  async writeFiles() {
    /* no-op */
  },
  async logs() {
    return ["[mock] sandbox running", "[mock] ready on :3000"];
  },
  async destroy() {
    /* no-op */
  },
};

// ── E2B driver (stub) ───────────────────────────────────────────────────────

/**
 * E2B driver. Wire up `@e2b/code-interpreter` (or the E2B SDK) here:
 *   - spawn a sandbox, git clone with the token, `npm install`, `npm run dev`
 *   - expose the dev port and return its public URL
 * Left as a guarded stub so the app runs without E2B credentials.
 */
const e2bDriver: SandboxDriver = {
  async create(opts) {
    if (!env.sandbox.e2bApiKey()) {
      return mockDriver.create(opts);
    }
    // TODO: implement with the E2B SDK using env.sandbox.e2bApiKey().
    throw new Error("E2B driver not yet implemented — set SANDBOX_DRIVER=mock");
  },
  async writeFiles() {
    throw new Error("E2B driver not yet implemented");
  },
  async logs() {
    throw new Error("E2B driver not yet implemented");
  },
  async destroy() {
    throw new Error("E2B driver not yet implemented");
  },
};

export function getSandboxDriver(): SandboxDriver {
  switch (env.sandbox.driver) {
    case "e2b":
      return e2bDriver;
    case "docker":
      // TODO: implement a Docker-backed driver for self-hosting.
      return mockDriver;
    default:
      return mockDriver;
  }
}
