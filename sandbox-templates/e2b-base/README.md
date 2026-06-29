# E2B base template (Build System 2.0)

The sandbox environment for live-preview sessions. Each preview clones the
user's Next.js repo into a fresh sandbox built from this template, installs
deps, and runs `next dev` (see `src/lib/sandbox/e2b.ts`).

This replaces the old root `e2b.Dockerfile` with E2B's v2 code-defined
templates (`Template` builder + `Template.build`).

## What it provides

- E2B code-interpreter base (Node 22 + git)
- corepack enabled → `pnpm` / `yarn` resolve from a repo's lockfile
- WORKDIR `/home/user`
- **no start command** — the app starts the dev server per sandbox at runtime

Edit the environment in `template.ts`; both build scripts import it.

## Build

```bash
cd sandbox-templates/e2b-base
npm install
export E2B_API_KEY=...        # or put it in this folder's .env
npm run build:dev             # alias: site-editor-base-dev
npm run build:prod            # alias: site-editor-base
```

## Wire up

Point the app at the built template via env (read in `src/lib/env.ts` →
`env.sandbox.e2bTemplate`, consumed by the E2B driver):

```bash
E2B_TEMPLATE=site-editor-base       # prod
# E2B_TEMPLATE=site-editor-base-dev # while iterating
```

If `E2B_TEMPLATE` is unset the driver falls back to E2B's default base image.
