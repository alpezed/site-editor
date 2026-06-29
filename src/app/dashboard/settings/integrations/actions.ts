"use server";

import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { disconnect } from "@/lib/github/connection";
import { getInstallUrl } from "@/lib/github/app";
import { logAudit } from "@/lib/audit";
import { GH_STATE_COOKIE } from "@/lib/github/oauth-state";

/** Start the GitHub connection flow. Sends the user to the App's install
 *  screen (which also authorizes OAuth during install, per the App config), so
 *  the user picks which repos — including private — the App can access.
 *  `returnTo` is where the callback sends the user once it completes. */
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

  redirect(getInstallUrl(state));
}

export async function disconnectGithub(
  returnTo = "/dashboard/settings/integrations",
) {
  const user = await requireUser();
  await disconnect(user.id);
  await logAudit(user.id, "github.disconnect");
  redirect(returnTo);
}
