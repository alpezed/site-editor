import Link from "next/link";
import { Plus, Github } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function DashboardPage() {
  const user = await requireUser();
  const sites = await prisma.site.findMany({
    where: { ownerId: user.id },
    include: { repository: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="mx-auto max-w-5xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Your sites</h1>
          <p className="text-sm text-muted-foreground">
            {sites.length} site{sites.length === 1 ? "" : "s"}
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/sites/new">
            <Plus className="size-4" /> New Site
          </Link>
        </Button>
      </div>

      {sites.length === 0 ? (
        <Card>
          <CardHeader className="items-center text-center">
            <CardTitle>No sites yet</CardTitle>
            <CardDescription>
              Create your first site, then connect a GitHub repository.
            </CardDescription>
            <Button asChild className="mt-4">
              <Link href="/dashboard/sites/new">
                <Plus className="size-4" /> Create a site
              </Link>
            </Button>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sites.map((site) => (
            <Link key={site.id} href={`/dashboard/sites/${site.id}`}>
              <Card className="h-full transition-colors hover:border-foreground/30">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>{site.name}</CardTitle>
                    {site.repository ? (
                      <Badge variant="success">Connected</Badge>
                    ) : (
                      <Badge variant="outline">No repo</Badge>
                    )}
                  </div>
                  <CardDescription>/{site.slug}</CardDescription>
                  {site.repository && (
                    <p className="flex items-center gap-1 pt-2 text-xs text-muted-foreground">
                      <Github className="size-3" />
                      {site.repository.repositoryName}
                    </p>
                  )}
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
