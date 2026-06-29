import { Sandbox } from "e2b";
import { env } from "@/lib/env";
import type { Sandbox as SandboxInfo, SandboxDriver } from "@/lib/sandbox/types";

/**
 * E2B-backed live-preview driver.
 *
 * Each imported project runs in an isolated E2B sandbox:
 *   1. clone the connected repo + branch using the GitHub access token,
 *   2. install dependencies (honouring the lockfile / package manager),
 *   3. start the Next.js dev server on 0.0.0.0:3000 in the background, piping
 *      output to a log file,
 *   4. expose the dev port via E2B's public host and return the preview URL.
 *
 * Hot reload comes for free: writing files into the sandbox (writeFiles) makes
 * the running dev server recompile.
 *
 * Requires E2B_API_KEY. The default E2B sandbox template ships Node + npm; set
 * E2B_TEMPLATE to a custom template if your projects need pnpm/yarn/other tools.
 */

const APP_DIR = "/home/user/app";
const DEV_PORT = 3000;
const LOG_FILE = `${APP_DIR}/dev.log`;
/** Keep sandboxes alive for 15 min of inactivity; extend on interaction. */
const TIMEOUT_MS = 15 * 60_000;
const INSTALL_TIMEOUT_MS = 5 * 60_000;

function template(): string | undefined {
  return process.env.E2B_TEMPLATE || undefined;
}

async function open(sandboxId: string): Promise<Sandbox> {
  return Sandbox.connect(sandboxId, { apiKey: env.sandbox.e2bApiKey() });
}

export const e2bDriver: SandboxDriver = {
  async create({ repoFullName, branch, accessToken }): Promise<SandboxInfo> {
    const apiKey = env.sandbox.e2bApiKey();
    const tpl = template();
    const sbx = tpl
      ? await Sandbox.create(tpl, { apiKey, timeoutMs: TIMEOUT_MS })
      : await Sandbox.create({ apiKey, timeoutMs: TIMEOUT_MS });

    // 1) Clone. The token is embedded in the URL only for this one command.
    const cloneUrl = `https://x-access-token:${accessToken}@github.com/${repoFullName}.git`;
    await sbx.commands.run(
      `rm -rf ${APP_DIR} && git clone --depth 1 --branch ${branch} ${cloneUrl} ${APP_DIR}`,
      { timeoutMs: INSTALL_TIMEOUT_MS },
    );

    // 2) Install dependencies, honouring the lockfile.
    await sbx.commands.run(
      `cd ${APP_DIR} && \
       if [ -f pnpm-lock.yaml ]; then corepack enable && pnpm install --frozen-lockfile || pnpm install; \
       elif [ -f yarn.lock ]; then corepack enable && yarn install --frozen-lockfile || yarn install; \
       else npm install; fi`,
      { timeoutMs: INSTALL_TIMEOUT_MS, envs: { NEXT_TELEMETRY_DISABLED: "1" } },
    );

    // 3) Start the dev server in the background, logging to a file.
    await sbx.commands.run(
      `cd ${APP_DIR} && nohup npx --yes next dev -H 0.0.0.0 -p ${DEV_PORT} > ${LOG_FILE} 2>&1 &`,
      { background: true, envs: { NEXT_TELEMETRY_DISABLED: "1" } },
    );

    // 4) Public preview URL.
    const host = sbx.getHost(DEV_PORT);
    return { id: sbx.sandboxId, previewUrl: `https://${host}` };
  },

  async writeFiles(sandboxId, files) {
    const sbx = await open(sandboxId);
    await sbx.files.write(
      files.map((f) => ({
        path: f.path.startsWith("/") ? f.path : `${APP_DIR}/${f.path}`,
        data: f.content,
      })),
    );
    // Touch the timeout so an actively-edited sandbox stays alive.
    await Sandbox.setTimeout(sandboxId, TIMEOUT_MS, {
      apiKey: env.sandbox.e2bApiKey(),
    });
  },

  async logs(sandboxId) {
    const sbx = await open(sandboxId);
    try {
      const content = await sbx.files.read(LOG_FILE);
      return String(content).split("\n").slice(-200);
    } catch {
      return [];
    }
  },

  async destroy(sandboxId) {
    await Sandbox.kill(sandboxId, { apiKey: env.sandbox.e2bApiKey() });
  },
};
