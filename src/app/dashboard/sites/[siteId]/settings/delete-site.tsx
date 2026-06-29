"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteSite } from "@/app/dashboard/sites/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function DeleteSite({ siteId, siteName }: { siteId: string; siteName: string }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <div className="mt-10 rounded-lg border border-destructive/40 p-4">
      <h2 className="text-sm font-semibold text-destructive">Danger zone</h2>
      <p className="mt-1 mb-3 text-sm text-muted-foreground">
        Deleting this site removes its repository link, editor sessions and
        deployment history here. Your GitHub repo and its code are untouched.
      </p>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="destructive" size="sm">
            <Trash2 className="size-4" /> Delete site
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {siteName}?</DialogTitle>
            <DialogDescription>
              This cannot be undone. Type <strong>{siteName}</strong> to confirm.
            </DialogDescription>
          </DialogHeader>
          <input
            autoFocus
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={siteName}
            className="w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost" size="sm">
                Cancel
              </Button>
            </DialogClose>
            <Button
              variant="destructive"
              size="sm"
              disabled={confirm !== siteName || pending}
              onClick={() => startTransition(() => deleteSite(siteId))}
            >
              {pending ? "Deleting…" : "Delete site"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
