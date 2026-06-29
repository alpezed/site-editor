import { Template } from "e2b";

/**
 * Shared E2B v2 template for the live-preview sandboxes.
 *
 * Replaces the old `e2b.Dockerfile`: the E2B code-interpreter base (Node 22 +
 * git) with corepack enabled so pnpm/yarn resolve from a cloned repo's lockfile.
 *
 * No start command on purpose — the app clones the user's repo and starts
 * `next dev` per sandbox at runtime (see src/lib/sandbox/e2b.ts). WORKDIR stays
 * at /home/user (not /home/user/app): the driver `rm -rf`s the app dir before
 * cloning, and deleting the shell's own cwd breaks git's getcwd().
 */
export const template = Template()
  .fromImage("e2bdev/code-interpreter:latest")
  .runCmd(
    "corepack enable && " +
      "corepack prepare pnpm@latest --activate && " +
      "corepack prepare yarn@stable --activate",
  )
  .setWorkdir("/home/user");
