import { redirect } from "next/navigation";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import type { User } from "@prisma/client";

/**
 * Returns the application `User` row for the signed-in Supabase user, creating
 * (or updating) it on first sight. This is how Supabase Auth identity is
 * projected into application-specific data — we reference `authUserId` only.
 */
export async function syncUser(authUser: SupabaseUser): Promise<User> {
  const email = authUser.email ?? "";
  const fullName =
    (authUser.user_metadata?.full_name as string | undefined) ??
    (authUser.user_metadata?.name as string | undefined) ??
    null;
  const avatarUrl =
    (authUser.user_metadata?.avatar_url as string | undefined) ?? null;

  return prisma.user.upsert({
    where: { authUserId: authUser.id },
    create: { authUserId: authUser.id, email, fullName, avatarUrl },
    update: { email, fullName, avatarUrl },
  });
}

/** Current application user, or null if not signed in. */
export async function getCurrentUser(): Promise<User | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return syncUser(user);
}

/** Current application user, redirecting to /login when absent. */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
