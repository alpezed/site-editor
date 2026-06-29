import Link from "next/link";
import { LayoutDashboard, Settings, Github } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { Button } from "@/components/ui/button";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-muted/30 p-4 md:flex">
        <Link href="/dashboard" className="mb-6 px-2 text-lg font-semibold">
          Site Editor
        </Link>
        <nav className="flex flex-col gap-1 text-sm">
          <NavLink href="/dashboard" icon={<LayoutDashboard className="size-4" />}>
            Sites
          </NavLink>
          <NavLink
            href="/dashboard/settings/integrations"
            icon={<Github className="size-4" />}
          >
            Integrations
          </NavLink>
          <NavLink
            href="/dashboard/settings"
            icon={<Settings className="size-4" />}
          >
            Settings
          </NavLink>
        </nav>
        <div className="mt-auto space-y-2 border-t pt-4">
          <p className="truncate px-2 text-xs text-muted-foreground">
            {user.email}
          </p>
          <form action="/auth/signout" method="post">
            <Button variant="ghost" size="sm" className="w-full justify-start">
              Sign out
            </Button>
          </form>
        </div>
      </aside>
      <div className="flex-1">{children}</div>
    </div>
  );
}

function NavLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 rounded-md px-2 py-2 hover:bg-accent"
    >
      {icon}
      {children}
    </Link>
  );
}
