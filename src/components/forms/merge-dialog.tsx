"use client";

// Duplicate merge (spec §19 actionable fix). The chosen target keeps its
// identity; the source's data fills gaps and its activities move over.

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { prospectsApi, qk } from "@/lib/api-client";
import { useAppStore } from "@/state/app-state";
import { cn } from "@/lib/utils";

export function MergeDialog() {
  const mergeForm = useAppStore((s) => s.mergeForm);
  const closeMergeForm = useAppStore((s) => s.closeMergeForm);
  const openProspect = useAppStore((s) => s.openProspect);
  const queryClient = useQueryClient();
  const [targetId, setTargetId] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ids = mergeForm?.ids ?? [];

  const { data: records } = useQuery({
    queryKey: ["merge", ids.join(",")],
    queryFn: async () => {
      const list = await prospectsApi.list({ ids: ids.join(","), pageSize: 50 });
      return list.data;
    },
    enabled: ids.length >= 2,
  });

  useEffect(() => {
    if (mergeForm) {
      setTargetId(null);
      setError(null);
    }
  }, [mergeForm]);

  async function handleMerge() {
    if (!targetId || !mergeForm) return;
    const source = ids.find((id) => id !== targetId);
    if (!source) return;
    setMerging(true);
    setError(null);
    try {
      await prospectsApi.merge(targetId, source);
      toast({
        title: "Records merged",
        description: "The duplicate was folded into the kept record.",
      });
      await queryClient.invalidateQueries({ queryKey: ["prospects"] });
      await queryClient.invalidateQueries({ queryKey: ["prospect"] });
      await queryClient.invalidateQueries({ queryKey: qk.dataQuality });
      await queryClient.invalidateQueries({ queryKey: qk.companies() });
      closeMergeForm();
      openProspect(targetId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not merge the records. Try again.");
    } finally {
      setMerging(false);
    }
  }

  return (
    <Dialog open={mergeForm !== null} onOpenChange={(open) => !open && closeMergeForm()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Merge duplicate prospects</DialogTitle>
          <DialogDescription>
            Pick the record to keep. The other one is deleted after its identifiers,
            activities, and notes are moved over.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {(records ?? []).map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setTargetId(p.id)}
              aria-pressed={targetId === p.id}
              className={cn(
                "flex w-full flex-col gap-0.5 rounded-md border px-3 py-2.5 text-left transition-colors hover:bg-surface-subtle",
                targetId === p.id && "border-primary bg-accent/60",
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-medium">
                  {p.firstName} {p.lastName ?? ""}
                </span>
                <span className="font-num text-[11px] text-muted-foreground">
                  added {new Date(p.dateAdded).toLocaleDateString()}
                </span>
              </span>
              <span className="truncate text-[12px] text-muted-foreground">
                {p.jobTitle ?? "No title"} · {p.companyName ?? "No company"} · {p.linkedinUrl ?? "No LinkedIn"}
              </span>
            </button>
          ))}
          {records && records.length < 2 ? (
            <p className="text-[12.5px] text-muted-foreground">
              Both records must still exist. One may already be merged.
            </p>
          ) : null}
        </div>

        {targetId ? (
          <p className="rounded-sm bg-surface-subtle px-2.5 py-2 text-[12px] text-muted-foreground">
            The kept record gains any missing fields from the other. Existing values are
            never overwritten, and the merge is written to the activity log.
          </p>
        ) : null}

        {error ? (
          <p role="alert" className="rounded-sm bg-destructive/10 px-2.5 py-2 text-[12.5px] text-destructive">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={closeMergeForm}>
            Cancel
          </Button>
          <Button type="button" disabled={!targetId || merging} onClick={handleMerge}>
            {merging ? "Merging…" : "Merge into kept record"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
