import { NextResponse, type NextRequest } from "next/server";
import { verifyGithubSignature } from "@/lib/github/webhook";
import { prisma } from "@/lib/prisma";
import { recordDeployment } from "@/lib/deploy/service";
import { DeploymentTrigger } from "@prisma/client";

/**
 * GitHub App webhook. Public endpoint — authenticated by the HMAC signature.
 * Handles:
 *   - push: a push to a connected branch records an automatic deployment
 *     (Vercel's own Git integration performs the actual build/deploy).
 *   - installation / installation_repositories: keep installationId fresh.
 */
export async function POST(request: NextRequest) {
  const raw = await request.text();
  const signature = request.headers.get("x-hub-signature-256");
  if (!verifyGithubSignature(raw, signature)) {
    return NextResponse.json({ error: "bad_signature" }, { status: 401 });
  }

  const event = request.headers.get("x-github-event");
  const payload = JSON.parse(raw);

  switch (event) {
    case "push":
      await handlePush(payload);
      break;
    case "installation":
    case "installation_repositories":
      await handleInstallation(payload);
      break;
    default:
      break;
  }

  return NextResponse.json({ ok: true });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handlePush(payload: any) {
  const repoFullName: string | undefined = payload.repository?.full_name;
  const ref: string | undefined = payload.ref; // refs/heads/main
  const headSha: string | undefined = payload.after;
  if (!repoFullName || !ref) return;

  const branch = ref.replace("refs/heads/", "");
  const siteRepos = await prisma.siteRepository.findMany({
    where: { repositoryName: repoFullName, branch },
    select: { siteId: true },
  });

  await Promise.all(
    siteRepos.map((sr) =>
      recordDeployment({
        siteId: sr.siteId,
        commitHash: headSha,
        trigger: DeploymentTrigger.AUTOMATIC,
      }),
    ),
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleInstallation(payload: any) {
  const installationId = payload.installation?.id;
  const githubUserId = payload.installation?.account?.id;
  if (!installationId || !githubUserId) return;

  await prisma.githubConnection.updateMany({
    where: { githubUserId: String(githubUserId) },
    data: { installationId: String(installationId) },
  });
}
