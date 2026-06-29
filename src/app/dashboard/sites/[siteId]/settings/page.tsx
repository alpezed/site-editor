import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getConnection } from "@/lib/github/connection";
import {
  connectGithub,
  disconnectGithub,
} from "@/app/dashboard/settings/integrations/actions";
import { RepositorySettings } from "./repository-settings";
import { DeleteSite } from "./delete-site";
import { Button } from "@/components/ui/button";

export default async function SiteSettingsPage({
  params,
}: {
  params: Promise<{ siteId: string }>;
}) {
  const { siteId } = await params;
  const user = await requireUser();

  const site = await prisma.site.findFirst({
    where: { id: siteId, ownerId: user.id },
    include: { repository: true },
  });
  if (!site) notFound();

  const connection = await getConnection(user.id);
  const returnTo = `/dashboard/sites/${site.id}/settings`;
  const connectAction = connectGithub.bind(null, returnTo);
  const disconnectAction = disconnectGithub.bind(null, returnTo);

  return (
    <div className="mx-auto max-w-2xl p-8">
      <Button asChild variant="ghost" size="sm" className="mb-4">
        <Link href={`/dashboard/sites/${site.id}`}>
          <ArrowLeft className="size-4" /> Back to site
        </Link>
      </Button>

      <h1 className="mb-1 text-2xl font-semibold">{site.name} settings</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Connect a GitHub repository to start editing.
      </p>

      <RepositorySettings
        siteId={site.id}
        githubConnected={Boolean(connection)}
        githubUsername={connection?.githubUsername ?? null}
        connectGithubAction={connectAction}
        disconnectGithubAction={disconnectAction}
        repository={
          site.repository
            ? {
                repositoryName: site.repository.repositoryName,
                branch: site.repository.branch,
                framework: site.repository.framework,
                imported: Boolean(site.repository.importedAt),
              }
            : null
        }
      />

      <DeleteSite siteId={site.id} siteName={site.name} />
    </div>
  );
}
