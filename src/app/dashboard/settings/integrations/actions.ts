"use server";

import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { disconnect } from "@/lib/github/connection";
import { getAuthorizeUrl } from "@/lib/github/square-auth";
import { logAudit } from "@/lib/audit";
import { env } from "@/lib/env";
import { GH_STATE_COOKIE } from "@/lib/github/oauth-state";

/** Start the Square Auth GitHub connection flow. `returnTo` is where the
 *  callback sends the user once the connection completes. */
export async function connectGithub(returnTo: string) {
  await requireUser();

  const state = randomBytes(16).toString("hex");
  const cookieStore = await cookies();
  cookieStore.set(GH_STATE_COOKIE, `${state}:${returnTo}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  const url = getAuthorizeUrl({
    state,
    redirectUri: `${env.appUrl}/api/github/oauth/callback`,
  });
  redirect(url);
}

export async function disconnectGithub() {
  const user = await requireUser();
  await disconnect(user.id);
  await logAudit(user.id, "github.disconnect");
  redirect("/dashboard/settings/integrations");
}
