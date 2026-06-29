import Link from "next/link";
import { requireUser } from "@/lib/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default async function SettingsPage() {
  const user = await requireUser();

  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="mb-6 text-2xl font-semibold">Account settings</h1>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-base">Profile</CardTitle>
          <CardDescription>Managed by Supabase Auth.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p>
            <span className="text-muted-foreground">Email:</span> {user.email}
          </p>
          {user.fullName && (
            <p>
              <span className="text-muted-foreground">Name:</span>{" "}
              {user.fullName}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Integrations</CardTitle>
          <CardDescription>Connect GitHub to attach repositories.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href="/dashboard/settings/integrations">
              Manage integrations
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
