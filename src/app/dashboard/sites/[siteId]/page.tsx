import Link from "next/link";
import { notFound } from "next/navigation";
import { Github, Pencil, Settings, Rocket } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DeploymentStatusBadge } from "@/components/deployment-status-badge";

export default async function SitePage({
  params,
}: {
  params: Promise<{ siteId: string }>;
}) {
  const { siteId } = await params;
  const user = await requireUser();

  const site = await prisma.site.findFirst({
    where: { id: siteId, ownerId: user.id },
    include: {
      repository: true,
      deployments: { orderBy: { createdAt: "desc" }, take: 5 },
    },
  });
  if (!site) notFound();

  return (
    <div className="mx-auto max-w-4xl p-8">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{site.name}</h1>
          <p className="text-sm text-muted-foreground">/{site.slug}</p>
          {site.description && (
            <p className="mt-2 max-w-prose text-sm">{site.description}</p>
          )}
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href={`/dashboard/sites/${site.id}/settings`}>
              <Settings className="size-4" /> Settings
            </Link>
          </Button>
          <Button asChild disabled={!site.repository}>
            <Link href={`/dashboard/sites/${site.id}/editor`}>
              <Pencil className="size-4" /> Open editor
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Github className="size-4" /> Repository
            </CardTitle>
          </CardHeader>
          <CardContent>
            {site.repository ? (
              <div className="space-y-1 text-sm">
                <p className="font-medium">{site.repository.repositoryName}</p>
                <p className="text-muted-foreground">
                  Branch: {site.repository.branch} ·{" "}
                  {site.repository.framework ?? "not scanned"}
                </p>
                {!site.repository.importedAt && (
                  <Badge variant="warning" className="mt-2">
                    Not yet imported
                  </Badge>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  No repository connected.
                </p>
                <Button asChild size="sm">
                  <Link href={`/dashboard/sites/${site.id}/settings`}>
                    Connect Repository
                  </Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Rocket className="size-4" /> Deployments
            </CardTitle>
            <CardDescription>Latest activity</CardDescription>
          </CardHeader>
          <CardContent>
            {site.deployments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No deployments yet.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {site.deployments.map((d) => (
                  <li
                    key={d.id}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="truncate font-mono text-xs">
                      {d.commitHash?.slice(0, 7) ?? "—"}
                    </span>
                    <DeploymentStatusBadge status={d.status} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
