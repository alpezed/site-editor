/**
 * BullMQ worker process. Run with `npm run worker`. Requires Redis.
 *
 * Processes background jobs that the request handlers offload:
 *   - deploy: poll Vercel deployment status and mirror it into `deployments`
 *   - import: run the repository import pipeline
 *
 * If you run the app without Redis, jobs execute inline and this process is
 * not needed.
 */
import { Worker, type ConnectionOptions } from "bullmq";
import IORedis from "ioredis";
import { env } from "@/lib/env";
import { QUEUE_NAMES } from "@/lib/queue";
import { prisma } from "@/lib/prisma";
import { getDeployment } from "@/lib/deploy/vercel";

const connection = new IORedis(env.redisUrl, {
  maxRetriesPerRequest: null,
}) as unknown as ConnectionOptions;

new Worker(
  QUEUE_NAMES.deploy,
  async (job) => {
    const { deploymentRowId, vercelDeploymentId } = job.data as {
      deploymentRowId: string;
      vercelDeploymentId: string;
    };
    const result = await getDeployment(vercelDeploymentId);
    await prisma.deployment.update({
      where: { id: deploymentRowId },
      data: { status: result.status, url: result.url },
    });
  },
  { connection },
);

console.log("Worker started: listening for deploy/import/commit jobs");
