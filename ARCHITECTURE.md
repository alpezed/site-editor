# Architecture — SaaS v2

GitHub-powered visual Next.js site builder. Authentication, GitHub integration
and site management are intentionally independent layers.

## Layers

```
Supabase Auth ──► users (app profile, references auth_user_id)
                    │
                    ├─► github_connections  (one per user, via Square Auth)
                    │
                    └─► sites (many per user)
                          └─► site_repositories (one repo per site, MVP)
                                ├─► editor_sessions (autosave)
                                ├─► deployments
                                └─► assets
```

- **Identity (Supabase Auth):** email/password, Google OAuth, magic link.
  Sessions, password reset and email verification are all Supabase's job. On
  every callback `syncUser()` upserts the application `users` row.
- **GitHub (Square Auth + GitHub App):** not part of login. Connected once from
  Account Settings → Integrations. Square Auth brokers the OAuth code exchange
  and token refresh; we cache the tokens in `github_connections`.
- **Sites:** created without GitHub. A repository is attached later from the
  site's own settings page.

## Key directories

```
src/
  lib/
    auth.ts                 # Supabase user → app user projection
    supabase/               # browser + server clients, middleware session
    github/
      oauth.ts              # GitHub OAuth2 (authorize/exchange/refresh)
      app.ts                # Octokit: list repos, read/commit files
      connection.ts         # store/get/disconnect a user's GitHub connection
      webhook.ts            # HMAC signature verification
    import/
      framework-detect.ts   # Next.js detection
      component-scanner.ts   # routes/components/editable-fields/assets
      run.ts                # import orchestrator
    editor/
      ast.ts                # apply field edits to source
      save.ts               # the Save workflow
    sandbox/
      index.ts            # driver selector (E2B/Docker/mock)
      e2b.ts              # E2B driver: clone, install, dev server, hot reload
      service.ts          # editor session ↔ sandbox lifecycle + edit sync
    deploy/{vercel,service}.ts
    queue/index.ts          # BullMQ with inline fallback
    integrations/           # email, analytics, billing
  app/
    (auth)/                 # login, signup, shared form
    auth/callback           # OAuth/magic-link session exchange
    dashboard/
      page.tsx              # sites list
      sites/new             # create-site wizard
      sites/[siteId]/...    # site dashboard, settings (repo connect), editor
      settings/integrations # GitHub connect/disconnect
    api/
      github/oauth/callback # Square Auth return
      github/repositories   # list repos
      github/webhook        # push/installation
      sites/[siteId]/{repository,import,save,deploy,editor}
      sites/[siteId]/preview{,/sync}  # start/stop/logs + hot-reload sync
      vercel/webhook        # deployment status mirror
  workers/index.ts          # BullMQ worker process
```

## Save workflow (editor → live)

```
edit field  →  debounced autosave to editor_sessions.state.pending
Save & Publish:
  read pending edits
  → for each file: fetch source, applyFieldEdits (AST)
  → commitFiles (single commit, git data API) → push to branch
  → recordDeployment(AUTOMATIC)         # Vercel Git integration builds on push
  → clear pending edits
GitHub push webhook → record/confirm deployment
Vercel webhook → advance deployment status (QUEUED→BUILDING→READY)
```

## Connect-repository flow

```
Site Settings → "Connect Repository"
  GitHub connected?
    NO  → connectGithub() → Square Auth authorize → /api/github/oauth/callback
          → saveConnection → back to Site Settings
    YES → GET /api/github/repositories → choose repo + branch
          → POST /api/sites/:id/repository (upsert site_repositories)
          → "Import project" → POST /api/sites/:id/import
              → detect framework (Next.js only) → scan → persist metadata
```

## Security notes

- Webhooks are public but signature-verified (`x-hub-signature-256`); add Vercel
  signature verification before production.
- The GitHub OAuth start sets a CSRF `state` cookie validated on callback.
- All site-scoped API routes check `ownerId === currentUser.id`.
- GitHub tokens are cached server-side and refreshed transparently via Square
  Auth. Consider encrypting `access_token`/`refresh_token` at rest.

## Notable MVP simplifications / upgrade paths

- `applyFieldEdits` uses targeted string-literal rewrites. Swap for a
  Babel/recast round-trip for nested values and added keys — same signature.
- One repository per site. The schema allows lifting this later.
- E2B and Docker sandbox drivers are stubbed; the mock driver keeps the editor
  usable without them.
- Stripe/Resend/PostHog/Sentry are thin guarded clients — expand per feature.
```
