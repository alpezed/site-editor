import { Github, CheckCircle2 } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getConnection } from "@/lib/github/connection";
import { connectGithub, disconnectGithub } from "./actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function IntegrationsPage() {
  const user = await requireUser();
  const connection = await getConnection(user.id);

  const connect = connectGithub.bind(null, "/dashboard/settings/integrations");

  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="mb-1 text-2xl font-semibold">Integrations</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Connect GitHub once, then attach repositories to individual sites.
      </p>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Github className="size-6" />
            <div className="flex-1">
              <CardTitle>GitHub</CardTitle>
              <CardDescription>
                Powered by Square Auth + the GitHub App.
              </CardDescription>
            </div>
            {connection ? (
              <Badge variant="success">Connected</Badge>
            ) : (
              <Badge variant="outline">Not Connected</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {connection ? (
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="size-4 text-green-600" />
                Connected as{" "}
                <span className="font-medium">@{connection.githubUsername}</span>
              </p>
              <form action={disconnectGithub}>
                <Button variant="outline" size="sm">
                  Disconnect
                </Button>
              </form>
            </div>
          ) : (
            <form action={connect}>
              <Button>
                <Github className="size-4" /> Connect GitHub
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
