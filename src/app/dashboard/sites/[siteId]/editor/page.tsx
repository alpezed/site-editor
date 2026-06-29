import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { ProjectMetadata } from "@/lib/import/component-scanner";
import type { EditorState } from "@/lib/editor/types";
import { livePreviewUrl } from "@/lib/sandbox/service";
import { Editor } from "./editor";

export default async function EditorPage({
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
      deployments: { orderBy: { createdAt: "desc" }, take: 10 },
      editorSessions: { orderBy: { updatedAt: "desc" }, take: 1 },
    },
  });
  if (!site) notFound();
  if (!site.repository) redirect(`/dashboard/sites/${site.id}/settings`);

  const metadata = (site.repository.metadata as unknown as ProjectMetadata | null) ?? {
    routes: [],
    components: [],
    assets: [],
    scannedAt: "",
  };
  const initialState =
    (site.editorSessions[0]?.state as unknown as EditorState | undefined) ?? {
      pending: {},
    };

  return (
    <Editor
      siteId={site.id}
      siteName={site.name}
      repositoryName={site.repository.repositoryName}
      branch={site.repository.branch}
      imported={Boolean(site.repository.importedAt)}
      previewUrl={await livePreviewUrl(site.id)}
      metadata={metadata}
      initialState={initialState}
      latestDeploymentStatus={site.deployments[0]?.status ?? null}
      hasDeployed={site.deployments.length > 0}
      deployments={site.deployments.map((d) => ({
        id: d.id,
        status: d.status,
        trigger: d.trigger,
        commitHash: d.commitHash,
        url: d.url,
        createdAt: d.createdAt,
      }))}
    />
  );
}
