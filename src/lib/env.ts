/**
 * Centralised, type-safe environment access. Reading through these helpers
 * keeps `process.env.*` lookups out of feature code and lets us fail loudly
 * when a required variable is missing at runtime instead of getting silent
 * `undefined`s deep inside a request.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

export const env = {
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",

  supabase: {
    // Static references so Next.js inlines these into the client bundle.
    // Dynamic `process.env[name]` access is NOT inlined and yields undefined in the browser.
    url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    serviceRoleKey: () => required("SUPABASE_SERVICE_ROLE_KEY"),
    storageBucket: optional("SUPABASE_STORAGE_BUCKET", "assets"),
  },

  github: {
    appId: optional("GITHUB_APP_ID"),
    appSlug: optional("GITHUB_APP_SLUG"),
    clientId: optional("GITHUB_APP_CLIENT_ID"),
    clientSecret: () => optional("GITHUB_APP_CLIENT_SECRET"),
    privateKey: () => optional("GITHUB_APP_PRIVATE_KEY").replace(/\\n/g, "\n"),
    webhookSecret: () => optional("GITHUB_WEBHOOK_SECRET"),
  },

  sandbox: {
    driver: optional("SANDBOX_DRIVER", "mock") as "e2b" | "docker" | "mock",
    e2bApiKey: () => optional("E2B_API_KEY"),
  },

  vercel: {
    apiToken: () => optional("VERCEL_API_TOKEN"),
    teamId: optional("VERCEL_TEAM_ID"),
  },

  redisUrl: optional("REDIS_URL", "redis://localhost:6379"),

  stripe: {
    secretKey: () => optional("STRIPE_SECRET_KEY"),
    webhookSecret: () => optional("STRIPE_WEBHOOK_SECRET"),
    publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "",
  },

  resend: {
    apiKey: () => optional("RESEND_API_KEY"),
    from: optional("EMAIL_FROM", "noreply@example.com"),
  },

  posthog: {
    key: process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "",
    host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
  },

  sentryDsn: process.env.NEXT_PUBLIC_SENTRY_DSN ?? "",
};
