"use client";

import { useActionState } from "react";
import Link from "next/link";
import { createSite, type CreateSiteState } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const initial: CreateSiteState = {};

export default function NewSitePage() {
  const [state, formAction, pending] = useActionState(createSite, initial);

  return (
    <div className="mx-auto max-w-lg p-8">
      <Card>
        <form action={formAction}>
          <CardHeader>
            <CardTitle>Create a new site</CardTitle>
            <CardDescription>
              Step 1 of 1 — you can connect a GitHub repository afterwards.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Site name</Label>
              <Input id="name" name="name" placeholder="My Portfolio" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="slug">Slug</Label>
              <Input id="slug" name="slug" placeholder="my-portfolio" />
              <p className="text-xs text-muted-foreground">
                Lowercase letters, numbers and dashes. Defaults from the name.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                name="description"
                placeholder="Optional"
              />
            </div>
            {state.error && (
              <p className="text-sm text-destructive">{state.error}</p>
            )}
          </CardContent>
          <CardFooter className="justify-between">
            <Button asChild variant="ghost">
              <Link href="/dashboard">Cancel</Link>
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Creating…" : "Create site"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
