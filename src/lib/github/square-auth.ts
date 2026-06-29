import { env } from "@/lib/env";

/**
 * Square Auth client.
 *
 * Square Auth is the delegated identity broker that owns the GitHub OAuth /
 * GitHub App flow, token storage and refresh. The application never talks to
 * GitHub's OAuth endpoints directly — it sends users to Square Auth and
 * exchanges the returned code for a GitHub access/refresh token pair.
 *
 * The network calls below are written against a conventional OAuth2 shape.
 * Point SQUARE_AUTH_URL at the real service and adjust paths if needed.
 */

export interface SquareAuthTokens {
  githubUserId: string;
  githubUsername: string;
  installationId?: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
}

/** Build the URL that starts the GitHub connection flow. */
export function getAuthorizeUrl(params: {
  state: string;
  redirectUri: string;
}): string {
  const url = new URL("/oauth/authorize", env.squareAuth.url);
  url.searchParams.set("client_id", env.squareAuth.clientId);
  url.searchParams.set("provider", "github");
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("state", params.state);
  url.searchParams.set("scope", "repo read:user");
  return url.toString();
}

/** Exchange the authorization code for GitHub tokens. */
export async function exchangeCode(
  code: string,
  redirectUri: string,
): Promise<SquareAuthTokens> {
  const res = await fetch(new URL("/oauth/token", env.squareAuth.url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: env.squareAuth.clientId,
      client_secret: env.squareAuth.clientSecret(),
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!res.ok) {
    throw new Error(`Square Auth token exchange failed: ${res.status}`);
  }
  return normalizeTokens(await res.json());
}

/** Refresh an expired GitHub access token. */
export async function refreshToken(
  refreshToken: string,
): Promise<SquareAuthTokens> {
  const res = await fetch(new URL("/oauth/token", env.squareAuth.url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      client_id: env.squareAuth.clientId,
      client_secret: env.squareAuth.clientSecret(),
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) {
    throw new Error(`Square Auth token refresh failed: ${res.status}`);
  }
  return normalizeTokens(await res.json());
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeTokens(data: any): SquareAuthTokens {
  return {
    githubUserId: String(data.github_user_id ?? data.user?.id ?? ""),
    githubUsername: String(data.github_username ?? data.user?.login ?? ""),
    installationId: data.installation_id
      ? String(data.installation_id)
      : undefined,
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_in
      ? new Date(Date.now() + Number(data.expires_in) * 1000)
      : undefined,
  };
}
