import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

/** Verify a GitHub webhook payload against the X-Hub-Signature-256 header. */
export function verifyGithubSignature(
  rawBody: string,
  signature: string | null,
): boolean {
  const secret = env.github.webhookSecret();
  if (!secret || !signature) return false;

  const expected =
    "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");

  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
