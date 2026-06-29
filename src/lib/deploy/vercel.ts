import { env } from "@/lib/env";

/**
 * Vercel deployment client. Deployments are normally triggered automatically
 * by Vercel's own Git integration when we push a commit. These helpers let us
 * (a) read deployment status to mirror it into `deployments`, and (b) trigger a
 * manual deploy / redeploy from the editor.
 *
 * Guarded so the app runs without a Vercel token (returns a simulated result).
 */

const API = "https://api.vercel.com";

function teamQuery(): string {
  return env.vercel.teamId ? `?teamId=${env.vercel.teamId}` : "";
}

export interface VercelDeployment {
  id: string;
  status: "QUEUED" | "BUILDING" | "READY" | "ERROR" | "CANCELED";
  url?: string;
}

function headers() {
  return {
    authorization: `Bearer ${env.vercel.apiToken()}`,
    "content-type": "application/json",
  };
}

/** Trigger a deployment for a Vercel project from a git ref. */
export async function triggerDeployment(opts: {
  vercelProjectId: string;
  repoId: string;
  ref: string;
}): Promise<VercelDeployment> {
  if (!env.vercel.apiToken()) {
    return { id: `sim-${opts.ref}`, status: "QUEUED" };
  }

  const res = await fetch(`${API}/v13/deployments${teamQuery()}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      project: opts.vercelProjectId,
      gitSource: { type: "github", repoId: opts.repoId, ref: opts.ref },
    }),
  });
  if (!res.ok) throw new Error(`Vercel deploy failed: ${res.status}`);
  const data = await res.json();
  return { id: data.id, status: mapState(data.readyState ?? data.status), url: data.url };
}

/** Read current status of a deployment. */
export async function getDeployment(
  deploymentId: string,
): Promise<VercelDeployment> {
  if (!env.vercel.apiToken()) {
    return { id: deploymentId, status: "READY" };
  }
  const res = await fetch(
    `${API}/v13/deployments/${deploymentId}${teamQuery()}`,
    { headers: headers() },
  );
  if (!res.ok) throw new Error(`Vercel status failed: ${res.status}`);
  const data = await res.json();
  return { id: data.id, status: mapState(data.readyState), url: data.url };
}

function mapState(state: string): VercelDeployment["status"] {
  switch (state) {
    case "READY":
      return "READY";
    case "ERROR":
    case "CANCELED":
      return state;
    case "QUEUED":
    case "INITIALIZING":
      return "QUEUED";
    default:
      return "BUILDING";
  }
}
