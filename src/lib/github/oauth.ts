import { env } from "@/lib/env";

/**
 * GitHub OAuth2 (user-to-server) client.
 *
 * Talks to GitHub's OAuth2 endpoints directly using the GitHub App's client
 * credentials. We send the user to GitHub to authorize, exchange the returned
 * code for an access/refresh token pair, and refresh transparently when the
 * 8-hour user token expires.
 *
 * GitHub's token endpoint returns HTTP 200 even on failure, putting the error
 * in the JSON body (e.g. `{ "error": "bad_verification_code" }`) — so we check
 * the body, not just the status.
 */

const AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
const TOKEN_URL = "https://github.com/login/oauth/access_token";
const API_URL = "https://api.github.com";

export interface GithubTokens {
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
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_id", env.github.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("state", params.state);
  // GitHub Apps derive permissions from the app config, not the `scope` param.
  return url.toString();
}

/** Exchange the authorization code for GitHub tokens. */
export async function exchangeCode(
  code: string,
  redirectUri: string,
): Promise<GithubTokens> {
  const raw = await postToken({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });
  return enrichTokens(raw);
}

/** Refresh an expired GitHub access token. */
export async function refreshAccessToken(
  refreshToken: string,
): Promise<GithubTokens> {
  const raw = await postToken({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  return enrichTokens(raw);
}

interface RawTokens {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}

async function postToken(
  params: Record<string, string>,
): Promise<RawTokens> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      client_id: env.github.clientId,
      client_secret: env.github.clientSecret(),
      ...params,
    }),
  });

  if (!res.ok) {
    throw new Error(`GitHub token request failed: ${res.status}`);
  }
  const data = await res.json();
  if (data.error) {
    throw new Error(
      `GitHub token request failed: ${data.error_description ?? data.error}`,
    );
  }
  return data as RawTokens;
}

/** GitHub's token response carries no identity — fetch user + installation. */
async function enrichTokens(raw: RawTokens): Promise<GithubTokens> {
  const headers = {
    authorization: `Bearer ${raw.access_token}`,
    accept: "application/vnd.github+json",
  };

  const user = await fetch(`${API_URL}/user`, { headers }).then((r) =>
    r.ok ? r.json() : null,
  );

  // First accessible installation, if the app is installed for this user.
  const installations = await fetch(`${API_URL}/user/installations`, { headers })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  const installationId = installations?.installations?.[0]?.id;

  return {
    githubUserId: String(user?.id ?? ""),
    githubUsername: String(user?.login ?? ""),
    installationId: installationId ? String(installationId) : undefined,
    accessToken: raw.access_token,
    refreshToken: raw.refresh_token,
    expiresAt: raw.expires_in
      ? new Date(Date.now() + raw.expires_in * 1000)
      : undefined,
  };
}
