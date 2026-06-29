import { Queue, type ConnectionOptions } from "bullmq";
import IORedis from "ioredis";
import { env } from "@/lib/env";

/**
 * BullMQ-backed job queues. Long-running editor work (commit + push, import,
 * deployment polling) is offloaded here so request handlers stay fast.
 *
 * When Redis is unreachable we fall back to inline execution (see `enqueue`),
 * which keeps local development working without a Redis instance.
 */

export const QUEUE_NAMES = {
  deploy: "deploy",
  import: "import",
  commit: "commit",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

let connection: IORedis | null = null;
const queues = new Map<QueueName, Queue>();

function getConnection(): IORedis | null {
  if (connection) return connection;
  try {
    connection = new IORedis(env.redisUrl, {
      maxRetriesPerRequest: null,
      lazyConnect: true,
      // Don't crash the process when Redis is down.
      retryStrategy: () => null,
    });
    connection.on("error", () => {
      /* swallow — handled by fallback */
    });
    return connection;
  } catch {
    return null;
  }
}

export function getQueue(name: QueueName): Queue | null {
  const conn = getConnection();
  if (!conn) return null;
  if (!queues.has(name)) {
    queues.set(
      name,
      new Queue(name, { connection: conn as unknown as ConnectionOptions }),
    );
  }
  return queues.get(name)!;
}

/**
 * Enqueue a job, falling back to running `inline` immediately when no queue is
 * available. Callers pass the inline implementation so behaviour is identical
 * with or without Redis.
 */
export async function enqueue<T>(
  name: QueueName,
  jobName: string,
  data: T,
  inline: (data: T) => Promise<void>,
): Promise<void> {
  const queue = getQueue(name);
  if (!queue) {
    await inline(data);
    return;
  }
  try {
    await queue.add(jobName, data, {
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: 100,
      removeOnFail: 500,
    });
  } catch {
    await inline(data);
  }
}

export { getConnection };
