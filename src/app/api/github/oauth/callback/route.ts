import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { exchangeCode } from "@/lib/github/oauth";
import { saveConnection } from "@/lib/github/connection";
import { logAudit } from "@/lib/audit";
import { env } from "@/lib/env";
import { GH_STATE_COOKIE } from "@/lib/github/oauth-state";

/**
 * Square Auth → GitHub OAuth callback. Validates the CSRF state cookie,
 * exchanges the code for GitHub tokens, persists the connection and returns the
 * user to where they started (integrations page or a site's settings).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  const cookieStore = await cookies();
  const stored = cookieStore.get(GH_STATE_COOKIE)?.value;
  cookieStore.delete(GH_STATE_COOKIE);

  const [storedState, returnTo = "/dashboard/settings/integrations"] =
    (stored ?? "").split(":");

  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(`${origin}/login`);

  if (!code || !state || state !== storedState) {
    return NextResponse.redirect(
      `${origin}${returnTo}?error=github_state`,
    );
  }

  try {
    const tokens = await exchangeCode(
      code,
      `${env.appUrl}/api/github/oauth/callback`,
    );
    await saveConnection(user.id, tokens);
    await logAudit(user.id, "github.connect", tokens.githubUsername);
    return NextResponse.redirect(`${origin}${returnTo}?github=connected`);
  } catch {
    return NextResponse.redirect(`${origin}${returnTo}?error=github_exchange`);
  }
}
