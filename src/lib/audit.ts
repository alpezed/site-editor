import { prisma } from "@/lib/prisma";

/** Append-only audit log for important user actions. */
export async function logAudit(
  userId: string | null,
  action: string,
  target?: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        target,
        metadata: (metadata as object) ?? undefined,
      },
    });
  } catch {
    // Audit logging must never break the request it describes.
  }
}
