# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A SaaS platform to **visually edit existing Next.js websites** while the user keeps full ownership of their source. Source lives in the *user's* GitHub repo; the platform commits/pushes edits and Vercel deploys on push. The repo is the scaffold for **SaaS Architecture v2** — read `ARCHITECTURE.md` for the full data model and request flows; read `README.md` for the implemented-vs-stubbed status table.

## Commands

```bash
npm run dev               # Next dev server
npm run build             # prisma generate + next build
npm run lint              # next lint (eslint flat config: next/core-web-vitals + next/typescript)
npm run typecheck         # tsc --noEmit
npm run worker            # BullMQ worker process (tsx src/workers/index.ts) — needs Redis
npm run prisma:generate   # regenerate Prisma client (also runs in build)
npm run prisma:migrate    # prisma migrate dev — needs DATABASE_URL / DIRECT_URL
npm run prisma:studio
```

No test runner is configured. After changing Prisma models, run `prisma:generate`. After editing `process.env` usage, route it through `src/lib/env.ts` (see below).

Minimum env to run and click around: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `DATABASE_URL`, `DIRECT_URL`. Everything else no-ops safely without keys.

## Architecture — the three independent layers

The central design decision: **auth, GitHub, and sites are deliberately decoupled.** Don't entangle them.

1. **Identity = Supabase Auth.** Owns email/password, Google OAuth, magic link, sessions, password reset. App data never lives in Auth. The app `users` table references `auth_user_id` only. Every auth callback calls `syncUser()` (`src/lib/auth.ts`) to upsert the app `users` row.
2. **GitHub = OAuth2 + GitHub App.** *Not* part of login. Connected once, after login, from Account Settings → Integrations, and is optional. `src/lib/github/oauth.ts` runs GitHub's OAuth2 user-to-server flow (authorize/exchange/refresh) against the GitHub App's client credentials; tokens are cached in `github_connections`.
3. **Sites.** Created without GitHub. A repo is attached per-site later from the site's settings (one repo per site for the MVP — schema allows lifting this).

## Key flows (where to look before editing)

- **Save workflow** (`src/lib/editor/save.ts`): field edits debounce-autosave into `editor_sessions.state.pending`. "Save & Publish" reads pending → for each file fetch source + `applyFieldEdits` (AST) → single commit via Octokit git-data API → push → `recordDeployment(AUTOMATIC)` → clear pending. GitHub push webhook and Vercel webhook then advance deployment status.
- **Import** (`src/lib/import/run.ts`): detect framework (Next.js only) → `component-scanner.ts` builds routes/components/editable-fields/assets → persist metadata.
- **Editable-component convention**: developers export `export const editor = { title: { type: "text" }, ... }` from their components. The scanner reads this to build the inspector UI; the save workflow rewrites matching values. See `examples/EditableHero.tsx`.

## Conventions and non-obvious patterns

- **Env access**: never read `process.env.*` in feature code. Go through `src/lib/env.ts`. Pattern there is deliberate: plain values for optional config, and **function-wrapped getters** (e.g. `env.vercel.apiToken()`, `env.github.privateKey()`) for secrets that should fail loud (`required`) or be lazily resolved. Match this when adding config.
- **Graceful degradation everywhere**: external services are behind interfaces that fall back to no-op/mock when unconfigured, so the app runs before credentials exist:
  - Sandbox driver (`src/lib/sandbox/index.ts`): `getSandboxDriver()` picks e2b/docker/mock from `SANDBOX_DRIVER`, but **falls back to mock if the relevant key is missing**. Docker driver is still a stub.
  - Queue (`src/lib/queue/index.ts`): `enqueue(name, jobName, data, inline)` runs the `inline` impl immediately when Redis is unreachable. Callers always pass an inline implementation so behavior is identical with/without Redis.
  - Stripe/Resend/PostHog/Sentry (`src/lib/integrations/`): thin guarded clients, no-op without keys.
- **`applyFieldEdits`** (`src/lib/editor/ast.ts`) currently does targeted string-literal rewrites, not a full AST round-trip. For nested values or added keys, swap in Babel/recast — keep the same signature.
- **Path alias**: `@/*` → `src/*`.
- **Prisma**: snake_case DB columns mapped to camelCase fields via `@map`; UUID PKs. `schema.prisma` is the data source of truth.

## Security invariants (preserve these)

- All site-scoped API routes (`src/app/api/sites/[siteId]/*`) must check `ownerId === currentUser.id`.
- Webhooks are public but HMAC signature-verified (`src/lib/github/webhook.ts`, `x-hub-signature-256`). Vercel signature verification is still a TODO before production.
- GitHub OAuth start sets a CSRF `state` cookie validated on callback (`src/lib/github/oauth-state.ts`).
- GitHub tokens are cached server-side and refreshed transparently; encrypting `access_token`/`refresh_token` at rest is a noted upgrade path.

## Stack

Next.js 15 (App Router) · React 19 · TypeScript (strict) · Tailwind + shadcn-style UI (`src/components/ui`) · React Query · React Hook Form + Zod · Prisma + PostgreSQL · Supabase Auth/Storage · Octokit · BullMQ + Redis · E2B · Vercel.
