import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getConnection } from "@/lib/github/connection";
import { listRepositories } from "@/lib/github/app";

/** List repositories accessible to the signed-in user's GitHub connection. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const connection = await getConnection(user.id);
  if (!connection) {
    return NextResponse.json({ error: "github_not_connected" }, { status: 409 });
  }

  try {
    const repos = await listRepositories(connection);
    return NextResponse.json({ repositories: repos });
  } catch (err) {
    return NextResponse.json(
      { error: "github_list_failed", detail: String(err) },
      { status: 502 },
    );
  }
}
