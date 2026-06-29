import { env } from "@/lib/env";
import type { Sandbox, SandboxDriver } from "@/lib/sandbox/types";
import { e2bDriver } from "@/lib/sandbox/e2b";

/**
 * Live-preview sandbox abstraction. Each imported project runs in an isolated
 * environment that installs dependencies, runs the dev server with hot reload
 * and exposes a preview URL. Drivers:
 *   - e2b    : E2B cloud sandboxes (preferred) — see ./e2b.ts
 *   - docker : self-hosted container (TODO)
 *   - mock   : no-op driver for local development without credentials
 */

export type { Sandbox, SandboxDriver };

const mockDriver: SandboxDriver = {
  async create({ repoFullName }): Promise<Sandbox> {
    const id = `mock-${repoFullName.replace(/\W+/g, "-")}`;
    return { id, previewUrl: `${env.appUrl}/preview/mock` };
  },
  async writeFiles() {
    /* no-op */
  },
  async readFile() {
    return null;
  },
  async logs() {
    return ["[mock] sandbox running", "[mock] ready on :3000"];
  },
  async isAlive() {
    return true;
  },
  async destroy() {
    /* no-op */
  },
};

export function getSandboxDriver(): SandboxDriver {
  switch (env.sandbox.driver) {
    case "e2b":
      // Fall back to mock if E2B isn't configured, so the editor still loads.
      return env.sandbox.e2bApiKey() ? e2bDriver : mockDriver;
    case "docker":
      // TODO: implement a Docker-backed driver for self-hosting.
      return mockDriver;
    default:
      return mockDriver;
  }
}
