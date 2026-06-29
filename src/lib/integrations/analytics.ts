import { env } from "@/lib/env";

/**
 * Server-side PostHog capture. Client-side analytics are initialised in the
 * PostHogProvider. Guarded so it's a no-op without a key.
 */
export async function capture(opts: {
  distinctId: string;
  event: string;
  properties?: Record<string, unknown>;
}): Promise<void> {
  if (!env.posthog.key) return;
  try {
    await fetch(`${env.posthog.host}/capture/`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        api_key: env.posthog.key,
        event: opts.event,
        distinct_id: opts.distinctId,
        properties: opts.properties,
      }),
    });
  } catch {
    /* analytics is best-effort */
  }
}
