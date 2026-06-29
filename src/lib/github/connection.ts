import { prisma } from "@/lib/prisma";
import type { SquareAuthTokens } from "@/lib/github/square-auth";
import type { GithubConnection } from "@prisma/client";

/** The single GitHub connection for a user, if any. */
export function getConnection(userId: string): Promise<GithubConnection | null> {
  return prisma.githubConnection.findUnique({ where: { userId } });
}

/** Upsert a user's GitHub connection from Square Auth tokens. */
export function saveConnection(
  userId: string,
  tokens: SquareAuthTokens,
): Promise<GithubConnection> {
  const data = {
    githubUserId: tokens.githubUserId,
    githubUsername: tokens.githubUsername,
    installationId: tokens.installationId,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: tokens.expiresAt,
  };
  return prisma.githubConnection.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });
}

/** Disconnect GitHub. Site repositories referencing it are left intact but
 *  will fail to sync until reconnected — surfaced in the UI. */
export async function disconnect(userId: string): Promise<void> {
  await prisma.githubConnection.deleteMany({ where: { userId } });
}
