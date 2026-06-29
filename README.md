# Site Editor

A SaaS platform to **visually edit your existing Next.js websites** while keeping
full ownership of your source code. Source stays in **your GitHub repository**;
changes are committed and pushed by the platform and deployed automatically via
**Vercel**. Think: a modern CMS fused with GitHub + Vercel.

This repo is the scaffold implementing **SaaS Architecture v2**. It wires the
full vertical slice end-to-end with real client code, and isolates the heavy
external services (E2B, Vercel, Square Auth, Stripe) behind interfaces so the
app runs locally before you supply credentials.

## What's implemented

| Area | Status |
| --- | --- |
| Supabase Auth (email/password, Google OAuth, magic link) | ✅ real |
| App `users` projection from auth identity | ✅ real |
| Prisma schema — all tables (users, github_connections, sites, site_repositories, deployments, editor_sessions, assets, audit_logs) | ✅ real |
| Dashboard, New Site wizard, site dashboard, settings | ✅ real |
| GitHub connect via **Square Auth** OAuth (account-level, optional) | ✅ real flow, ⚙️ point `SQUARE_AUTH_URL` at the service |
| Repository connect + branch select | ✅ real (Octokit) |
| Repository import: framework detection + component scanner | ✅ real |
| Visual editor (3-column + bottom git/deploy bar) | ✅ real |
| Save workflow: apply field edits → commit → push → record deployment | ✅ real (Octokit git data API) |
| GitHub & Vercel webhooks | ✅ real (signature-verified) |
| Live preview sandbox (E2B / Docker / mock) | ⚙️ interface + mock driver; E2B driver stubbed |
| Vercel deploy trigger / status | ✅ real REST, simulated without a token |
| BullMQ/Redis queue + worker | ✅ real, falls back to inline without Redis |
| Stripe / Resend / PostHog / Sentry | ⚙️ guarded thin clients (no-op without keys) |

✅ = working code · ⚙️ = interface in place, plug in the real service

## Stack

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind + shadcn-style UI ·
React Query · React Hook Form + Zod · Prisma + PostgreSQL · Supabase Auth +
Storage · Octokit · BullMQ + Redis · E2B · Vercel · Stripe · Resend · PostHog ·
Sentry.

## Getting started

```bash
cp .env.example .env        # fill in what you have; the rest no-op safely
npm install
npm run prisma:generate
npm run prisma:migrate      # needs DATABASE_URL / DIRECT_URL
npm run dev
```

Optional background worker (needs Redis): `npm run worker`.

### Minimum to log in and click around

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `DATABASE_URL`, `DIRECT_URL`

Without GitHub/Vercel/E2B keys you can still sign up, create sites and navigate
the whole UI; the GitHub-dependent actions surface a "connect" prompt.

## Architecture

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the full design, data model and
request flows. The separation of concerns is deliberate:

- **Supabase Auth** owns identity. We never store app data in Auth — the `users`
  table references `auth_user_id`.
- **Square Auth** owns GitHub OAuth + token lifecycle. GitHub is connected
  *after* login, from Account Settings, and is optional.
- **Sites** are independent of GitHub; a repository is attached per-site later
  (one repo per site for the MVP).

## The editable-component convention

Developers expose editable fields in their own components:

```tsx
export const editor = {
  title: { type: "text" },
  subtitle: { type: "textarea" },
  image: { type: "image" },
}
```

The scanner reads this to build the inspector UI; the save workflow rewrites the
matching values and commits them. See [`examples/EditableHero.tsx`](./examples/EditableHero.tsx).
