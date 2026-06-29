"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/utils";
import { logAudit } from "@/lib/audit";

const createSiteSchema = z.object({
  name: z.string().min(1, "Name is required").max(80),
  slug: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9-]+$/, "Slug may only contain lowercase letters, numbers and dashes"),
  description: z.string().max(280).optional(),
});

export type CreateSiteState = { error?: string };

export async function createSite(
  _prev: CreateSiteState,
  formData: FormData,
): Promise<CreateSiteState> {
  const user = await requireUser();

  const parsed = createSiteSchema.safeParse({
    name: formData.get("name"),
    slug: slugify(String(formData.get("slug") || formData.get("name") || "")),
    description: formData.get("description") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const existing = await prisma.site.findUnique({
    where: { ownerId_slug: { ownerId: user.id, slug: parsed.data.slug } },
  });
  if (existing) {
    return { error: "You already have a site with that slug." };
  }

  const site = await prisma.site.create({
    data: {
      ownerId: user.id,
      name: parsed.data.name,
      slug: parsed.data.slug,
      description: parsed.data.description,
    },
  });

  await logAudit(user.id, "site.create", site.id, { name: site.name });

  revalidatePath("/dashboard");
  redirect(`/dashboard/sites/${site.id}`);
}

export async function deleteSite(siteId: string): Promise<void> {
  const user = await requireUser();

  // Ownership check via the same filter used everywhere else; deleteMany so a
  // non-owner (or already-deleted) site is a silent no-op, not a throw.
  const { count } = await prisma.site.deleteMany({
    where: { id: siteId, ownerId: user.id },
  });
  if (count > 0) {
    // Children (repository, sessions, deployments) cascade via FK onDelete.
    await logAudit(user.id, "site.delete", siteId);
  }

  revalidatePath("/dashboard");
  redirect("/dashboard");
}
