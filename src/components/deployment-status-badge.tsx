import { Badge } from "@/components/ui/badge";
import type { DeploymentStatus } from "@prisma/client";

const MAP: Record<
  DeploymentStatus,
  { label: string; variant: "default" | "success" | "destructive" | "warning" | "secondary" }
> = {
  QUEUED: { label: "Queued", variant: "secondary" },
  BUILDING: { label: "Building", variant: "warning" },
  READY: { label: "Ready", variant: "success" },
  ERROR: { label: "Error", variant: "destructive" },
  CANCELED: { label: "Canceled", variant: "secondary" },
};

export function DeploymentStatusBadge({
  status,
}: {
  status: DeploymentStatus;
}) {
  const { label, variant } = MAP[status];
  return <Badge variant={variant}>{label}</Badge>;
}
