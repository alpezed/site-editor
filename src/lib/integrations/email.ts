import { env } from "@/lib/env";

/**
 * Transactional email via Resend. Guarded so the app runs without a key
 * (logs instead of sending).
 */
export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  const apiKey = env.resend.apiKey();
  if (!apiKey) {
    console.info(`[email:noop] to=${opts.to} subject="${opts.subject}"`);
    return;
  }

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: env.resend.from,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    }),
  });
}
