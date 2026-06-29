import { Sandbox } from "e2b";
import { env } from "@/lib/env";
import { EDITOR_AGENT_JS } from "@/lib/sandbox/editor-agent";
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

/**
 * Run a command, surfacing the real stderr on failure. E2B throws a bare
 * "exit status N" otherwise, which hides why git/npm actually failed.
 */
async function run(
  sbx: Sandbox,
  stage: string,
  cmd: string,
  opts?: Parameters<Sandbox["commands"]["run"]>[1],
) {
  try {
    return await sbx.commands.run(cmd, opts);
  } catch (err: unknown) {
    const e = err as { stderr?: string; stdout?: string; message?: string };
    const raw = (e.stderr || e.stdout || e.message || "").trim().slice(-500);
    const detail = raw.replace(/x-access-token:[^@]*@/g, "***@");
    throw new Error(`${stage} failed: ${detail || "unknown error"}`);
  }
}

export const e2bDriver: SandboxDriver = {
  async create({ repoFullName, branch, accessToken }): Promise<SandboxInfo> {
    const apiKey = env.sandbox.e2bApiKey();
    const tpl = template();
    const sbx = tpl
      ? await Sandbox.create(tpl, { apiKey, timeoutMs: TIMEOUT_MS })
      : await Sandbox.create({ apiKey, timeoutMs: TIMEOUT_MS });

    // 1) Clone. The token is embedded in the URL only for this one command.
    // Try the requested branch; fall back to the repo's default branch.
    const cloneUrl = `https://x-access-token:${accessToken}@github.com/${repoFullName}.git`;
    if (!accessToken) {
      throw new Error(
        "No GitHub access token — reconnect GitHub and grant the App repo access.",
      );
    }
    // Run from /home/user, not APP_DIR: the template's WORKDIR may be APP_DIR,
    // and `rm -rf` on the shell's own cwd makes git's getcwd() fail with
    // "Unable to read current working directory".
    await run(
      sbx,
      "git clone",
      `cd /home/user && rm -rf ${APP_DIR} && ` +
        `(git clone --depth 1 --branch ${branch} ${cloneUrl} ${APP_DIR} || ` +
        `git clone --depth 1 ${cloneUrl} ${APP_DIR})`,
      { timeoutMs: INSTALL_TIMEOUT_MS },
    );

    // 2) Install dependencies, honouring the lockfile.
    await run(
      sbx,
      "install",
      `cd ${APP_DIR} && \
       if [ -f pnpm-lock.yaml ]; then corepack enable && pnpm install --frozen-lockfile || pnpm install; \
       elif [ -f yarn.lock ]; then corepack enable && yarn install --frozen-lockfile || yarn install; \
       else npm install; fi`,
      { timeoutMs: INSTALL_TIMEOUT_MS, envs: { NEXT_TELEMETRY_DISABLED: "1" } },
    );

    // 2b) Inject the click-to-edit agent: serve it from public/ and add a
    // <script> to the app's layout. Sandbox-only — never committed.
    await sbx.files.write(`${APP_DIR}/public/__editor-agent.js`, EDITOR_AGENT_JS);
    await sbx.commands.run(
      `cd ${APP_DIR} && node -e '
        const fs=require("fs");
        const tag="<script src=\\"/__editor-agent.js\\" data-site-editor-ignore></script>";
        const files=["app/layout.tsx","app/layout.jsx","src/app/layout.tsx","src/app/layout.jsx","pages/_document.tsx","pages/_document.jsx"];
        for(const f of files){ if(fs.existsSync(f)){ let s=fs.readFileSync(f,"utf8"); if(!s.includes("__editor-agent")){ s=s.replace(/(<body[^>]*>)/, "$1"+tag); fs.writeFileSync(f,s);} break; } }
      '`,
      { timeoutMs: 30_000 },
    ).catch(() => {});

    // 3) Start the dev server in the background, logging to a file.
    // Polling watchers (WATCHPACK_POLLING/CHOKIDAR_USEPOLLING) are required:
    // files written via the E2B filesystem API don't fire inotify in the sandbox
    // overlay, so without polling Next never invalidates its compiled routes and
    // keeps serving stale pages even after writeFiles + a full reload.
    await sbx.commands.run(
      `cd ${APP_DIR} && nohup npx --yes next dev -H 0.0.0.0 -p ${DEV_PORT} > ${LOG_FILE} 2>&1 &`,
      {
        background: true,
        envs: {
          NEXT_TELEMETRY_DISABLED: "1",
          WATCHPACK_POLLING: "true",
          CHOKIDAR_USEPOLLING: "true",
        },
      },
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

  async isAlive(sandboxId) {
    try {
      await open(sandboxId);
      return true;
    } catch {
      return false;
    }
  },

  async destroy(sandboxId) {
    await Sandbox.kill(sandboxId, { apiKey: env.sandbox.e2bApiKey() });
  },
};
