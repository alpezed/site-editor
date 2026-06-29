import { prisma } from "@/lib/prisma";
import { triggerDeployment } from "@/lib/deploy/vercel";
import { DeploymentTrigger } from "@prisma/client";

/**
 * Record a deployment for a site and (optionally) trigger it on Vercel.
 * Automatic deployments are usually created by Vercel's Git integration on
 * push — for those we create the row in QUEUED and let the Vercel webhook move
 * it forward. Manual deploys / redeploys also fire the Vercel API.
 */
export async function recordDeployment(opts: {
  siteId: string;
  commitHash?: string;
  trigger: DeploymentTrigger;
  vercelProjectId?: string;
  repoId?: string;
  ref?: string;
  fire?: boolean;
}) {
  const deployment = await prisma.deployment.create({
    data: {
      siteId: opts.siteId,
      commitHash: opts.commitHash,
      trigger: opts.trigger,
      vercelProjectId: opts.vercelProjectId,
      status: "QUEUED",
    },
  });

  if (opts.fire && opts.vercelProjectId && opts.repoId && opts.ref) {
    try {
      const result = await triggerDeployment({
        vercelProjectId: opts.vercelProjectId,
        repoId: opts.repoId,
        ref: opts.ref,
      });
      await prisma.deployment.update({
        where: { id: deployment.id },
        data: { deploymentId: result.id, status: result.status, url: result.url },
      });
    } catch (err) {
      await prisma.deployment.update({
        where: { id: deployment.id },
        data: {
          status: "ERROR",
          logs: { error: String(err) },
        },
      });
    }
  }

  return deployment;
}
