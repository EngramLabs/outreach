"use client";

// Prospect detail drawer (spec §12): identity, lifecycle dates, notes,
// verification summary, activity timeline, and the quick actions an operator
// needs while working a single record. Mounted once globally by the shell.

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, format } from "date-fns";
import { toast } from "@/hooks/use-toast";
import { prospectsApi, qk } from "@/lib/api-client";
import { PRIORITIES, PROSPECT_STATUSES, FOLLOWUP_SHORTCUTS } from "@/lib/constants";
import { useAppStore } from "@/state/app-state";
import { ExternalLink, Link2, MoreHorizontal, Copy, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DateLabel, DueDateLabel } from "@/components/shared/date-label";
import { PriorityBadge, VerificationBadge } from "@/components/shared/status-badge";
import { Timeline } from "@/components/shared/timeline";
import { splitTags } from "@/lib/normalize";
import { cn } from "@/lib/utils";

export function ProspectDrawerLayer() {
  const drawerId = useAppStore((s) => s.prospectDrawerId);
  const closeProspect = useAppStore((s) => s.closeProspect);

  return (
    <Sheet
      open={drawerId !== null}
      onOpenChange={(open) => {
        if (!open) closeProspect();
      }}
    >
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
        {drawerId ? <ProspectDrawer key={drawerId} id={drawerId} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function ProspectDrawer({ id }: { id: string }) {
  const queryClient = useQueryClient();
  const closeProspect = useAppStore((s) => s.closeProspect);
  const openProspectForm = useAppStore((s) => s.openProspectForm);
  const openActivityForm = useAppStore((s) => s.openActivityForm);
  const openVerifyForm = useAppStore((s) => s.openVerifyForm);

  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [confirmKind, setConfirmKind] = useState<"archive" | "unarchive" | "delete" | null>(null);

  const detailQuery = useQuery({
    queryKey: qk.prospect(id),
    queryFn: () => prospectsApi.get(id),
  });
  const prospect = detailQuery.data;

  function invalidateProspectCaches() {
    void queryClient.invalidateQueries({ queryKey: ["prospect"] });
    void queryClient.invalidateQueries({ queryKey: ["prospects"] });
    void queryClient.invalidateQueries({ queryKey: qk.dashboard });
    void queryClient.invalidateQueries({ queryKey: ["followups"] });
  }

  const updateMutation = useMutation({
    mutationFn: (patch: Record<string, unknown>) => prospectsApi.update(id, patch),
    onSuccess: (_row, patch) => {
      invalidateProspectCaches();
      if (patch.status !== undefined) {
        toast({
          title: "Status changed",
          description: `A Status Change activity was recorded and missing lifecycle dates were filled automatically.`,
        });
      } else if (patch.priority !== undefined) {
        toast({ title: "Priority changed", description: `Priority set to ${_row.priority}.` });
      } else if (patch.nextFollowUpDate !== undefined) {
        toast({
          title: "Follow-up scheduled",
          description: patch.nextFollowUpDate
            ? `Due ${format(new Date(patch.nextFollowUpDate as string), "EEEE, MMM d, yyyy")}.`
            : "The follow-up date was cleared.",
        });
      }
    },
    onError: (err) => {
      toast({
        title: "Change failed",
        description: err instanceof Error ? err.message : "Nothing was saved. Try again.",
        variant: "destructive",
      });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (action: "archive" | "restore") =>
      prospectsApi.bulk({ ids: [id], action }),
    onSuccess: (_res, action) => {
      invalidateProspectCaches();
      setConfirmKind(null);
      toast({
        title: action === "archive" ? "Prospect archived" : "Prospect restored",
        description:
          action === "archive"
            ? "The record moved to the Archive. Restore it any time from the Archive view."
            : "The record is back in the active list.",
      });
    },
    onError: (err) => {
      toast({
        title: "Could not archive",
        description: err instanceof Error ? err.message : "Try again.",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => prospectsApi.remove(id),
    onSuccess: () => {
      invalidateProspectCaches();
      void queryClient.invalidateQueries({ queryKey: ["activities"] });
      setConfirmKind(null);
      closeProspect();
      toast({
        title: "Prospect deleted",
        description: "The record and its activities were permanently removed.",
      });
    },
    onError: (err) => {
      toast({
        title: "Delete failed",
        description: err instanceof Error ? err.message : "Try again.",
        variant: "destructive",
      });
    },
  });

  async function copyText(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: label });
    } catch {
      toast({
        title: "Copy failed",
        description: "Your browser blocked clipboard access — select the text and copy manually.",
        variant: "destructive",
      });
    }
  }

  function scheduleFollowUp(date: Date | null) {
    setFollowUpOpen(false);
    updateMutation.mutate({ nextFollowUpDate: date ? date.toISOString() : null });
  }

  // --- Loading / error -----------------------------------------------------
  if (detailQuery.isPending) {
    return (
      <SheetHeader className="space-y-1.5 border-b p-4">
        <SheetTitle className="text-base font-semibold">
          <Skeleton className="h-5 w-48" />
        </SheetTitle>
        <SheetDescription>Loading the record…</SheetDescription>
        <div className="mt-3 space-y-3">
          <div className="flex gap-2">
            <Skeleton className="h-8 w-36" />
            <Skeleton className="h-8 w-28" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-8 w-28" />
            <Skeleton className="h-8 w-36" />
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-8 w-24" />
          </div>
          <div className="space-y-2 pt-2">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-4 w-full" style={{ opacity: 1 - i * 0.12 }} />
            ))}
          </div>
        </div>
      </SheetHeader>
    );
  }

  if (detailQuery.isError || !prospect) {
    return (
      <SheetHeader className="space-y-1.5 border-b p-4">
        <SheetTitle className="text-base font-semibold">Prospect</SheetTitle>
        <SheetDescription className="sr-only">
          The record could not be loaded.
        </SheetDescription>
        <div
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[13px] text-foreground"
        >
          {detailQuery.error instanceof Error
            ? detailQuery.error.message
            : "This record could not be loaded."}
        </div>
        <Button
          size="sm"
          variant="outline"
          className="mt-2 w-fit"
          onClick={() => void detailQuery.refetch()}
        >
          Try again
        </Button>
      </SheetHeader>
    );
  }

  const fullName = `${prospect.firstName}${prospect.lastName ? ` ${prospect.lastName}` : ""}`;
  const isArchived = prospect.archivedAt !== null;
  const activityCount = prospect.activities.length;

  // --- Render --------------------------------------------------------------
  return (
    <>
      <SheetHeader className="space-y-1.5 border-b p-4">
        <SheetTitle className="flex flex-wrap items-center gap-2 pr-8 text-base font-semibold leading-6">
          <span className="truncate">{fullName}</span>
          {isArchived ? (
            <span className="tone-archived rounded-sm px-1.5 py-0.5 text-[11px] font-medium">
              Archived
            </span>
          ) : null}
        </SheetTitle>
        <SheetDescription className="text-[13px] leading-relaxed">
          {[prospect.jobTitle, prospect.companyName].filter(Boolean).join(" · ") ||
            "No title or company on record"}
        </SheetDescription>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Select
            value={prospect.status as string}
            onValueChange={(v) => updateMutation.mutate({ status: v })}
            disabled={updateMutation.isPending}
          >
            <SelectTrigger size="sm" className="h-8 w-[168px] text-[13px]" aria-label="Status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROSPECT_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={prospect.priority as string}
            onValueChange={(v) => updateMutation.mutate({ priority: v })}
            disabled={updateMutation.isPending}
          >
            <SelectTrigger size="sm" className="h-8 w-[118px] text-[13px]" aria-label="Priority">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRIORITIES.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-2">
          {prospect.linkedinUrl ? (
            <Button variant="outline" size="sm" className="h-8 text-[13px]" asChild>
              <a href={prospect.linkedinUrl} target="_blank" rel="noreferrer">
                Open LinkedIn
                <ExternalLink aria-hidden className="size-3.5" />
              </a>
            </Button>
          ) : null}
          <Button variant="outline" size="sm" className="h-8 text-[13px]" onClick={() => openActivityForm(id)}>
            Log activity
          </Button>
          <Popover open={followUpOpen} onOpenChange={setFollowUpOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 text-[13px]">
                Schedule follow-up
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-64 p-2">
              <p className="px-1 pb-1.5 text-[12px] font-medium text-foreground">Schedule for</p>
              <div className="grid grid-cols-2 gap-1">
                {FOLLOWUP_SHORTCUTS.map((s) => {
                  const date = addDays(new Date(), s.days);
                  return (
                    <Button
                      key={s.label}
                      variant="outline"
                      size="sm"
                      className="h-8 justify-start px-2 text-[12.5px]"
                      disabled={updateMutation.isPending}
                      onClick={() => scheduleFollowUp(date)}
                    >
                      {s.label}
                      <span className="font-num ml-auto text-[11px] text-muted-foreground">
                        {format(date, "MMM d")}
                      </span>
                    </Button>
                  );
                })}
              </div>
              <div className="mt-2 border-t pt-2">
                <p className="px-1 pb-1 text-[12px] font-medium text-foreground">Pick a date</p>
                <div className="flex justify-center">
                  <Calendar
                    mode="single"
                    onSelect={(d) => {
                      if (d) scheduleFollowUp(d);
                    }}
                    // today's date is the sensible earliest follow-up
                    disabled={{ before: new Date() }}
                  />
                </div>
              </div>
              {prospect.nextFollowUpDate ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2 h-8 w-full text-[12.5px] text-muted-foreground"
                  disabled={updateMutation.isPending}
                  onClick={() => scheduleFollowUp(null)}
                >
                  Clear follow-up date
                </Button>
              ) : null}
            </PopoverContent>
          </Popover>
          <Button variant="outline" size="sm" className="h-8 text-[13px]" onClick={() => openVerifyForm(id)}>
            Verify
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-[13px]" onClick={() => openProspectForm(id)}>
            Edit
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-[13px]"
            onClick={() => setConfirmKind(isArchived ? "unarchive" : "archive")}
          >
            {isArchived ? "Unarchive" : "Archive"}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 px-0"
                aria-label="More actions"
              >
                <MoreHorizontal aria-hidden className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem
                disabled={!prospect.email}
                onSelect={() => prospect.email && copyText(prospect.email, "Email copied")}
              >
                <Copy aria-hidden className="size-3.5" /> Copy email
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!prospect.linkedinUrl}
                onSelect={() =>
                  prospect.linkedinUrl && copyText(prospect.linkedinUrl, "LinkedIn URL copied")
                }
              >
                <Link2 aria-hidden className="size-3.5" /> Copy LinkedIn URL
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setConfirmKind("delete")}>
                <Trash2 aria-hidden className="size-3.5" /> Delete prospect…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </SheetHeader>

      {/* Body */}
      <div className="flex-1 space-y-5 overflow-y-auto scroll-slim p-4">
        <section aria-label="Contact and context">
          <SectionLabel>Contact &amp; context</SectionLabel>
          <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-2.5">
            <Field label="Email">
              {prospect.email ? (
                <a
                  href={`mailto:${prospect.email}`}
                  className="break-all text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                >
                  {prospect.email}
                </a>
              ) : (
                <MutedDash />
              )}
            </Field>
            <Field label="Location">
              {prospect.location ?? <MutedDash />}
            </Field>
            <Field label="Source">
              {prospect.source ?? <MutedDash />}
            </Field>
            <Field label="Campaign">
              {prospect.campaignName ?? <span className="text-muted-foreground">None</span>}
            </Field>
            <Field label="Company">
              {prospect.companyName ?? <span className="text-muted-foreground">No company</span>}
            </Field>
            <Field label="Fit score">
              <span className={cn("font-num", prospect.fitScore == null && "text-muted-foreground/50")}>
                {prospect.fitScore ?? "—"}
              </span>
            </Field>
            <Field label="Priority">
              <PriorityBadge priority={prospect.priority} />
            </Field>
            <Field label="Added">
              <DateLabel date={prospect.dateAdded} />
            </Field>
            {prospect.tags ? (
              <div className="col-span-2">
                <dt className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                  Tags
                </dt>
                <dd className="mt-1 flex flex-wrap gap-1">
                  {splitTags(prospect.tags).map((tag) => (
                    <span
                      key={tag}
                      className="rounded-sm bg-surface-subtle px-1.5 py-0.5 text-[11px] text-muted-foreground"
                    >
                      {tag}
                    </span>
                  ))}
                </dd>
              </div>
            ) : null}
          </dl>
        </section>

        {prospect.outreachAngle || prospect.researchNotes || prospect.notes ? (
          <section aria-label="Notes" className="space-y-3 border-t pt-4">
            <SectionLabel>Notes</SectionLabel>
            {prospect.outreachAngle ? (
              <div>
                <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                  Outreach angle
                </p>
                <p className="mt-1 text-[13px] leading-relaxed whitespace-pre-wrap text-foreground/90">
                  {prospect.outreachAngle}
                </p>
              </div>
            ) : null}
            {prospect.researchNotes ? (
              <div>
                <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                  Research notes
                </p>
                <p className="mt-1 text-[13px] leading-relaxed whitespace-pre-wrap text-foreground/90">
                  {prospect.researchNotes}
                </p>
              </div>
            ) : null}
            {prospect.notes ? (
              <div>
                <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                  Notes
                </p>
                <p className="mt-1 text-[13px] leading-relaxed whitespace-pre-wrap text-foreground/90">
                  {prospect.notes}
                </p>
              </div>
            ) : null}
          </section>
        ) : null}

        <section aria-label="Verification" className="border-t pt-4">
          <SectionLabel>Verification</SectionLabel>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <VerificationBadge status={prospect.verificationStatus} />
            {prospect.verifiedAt ? (
              <span className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
                verified
                <DateLabel date={prospect.verifiedAt} />
              </span>
            ) : (
              <span className="text-[12.5px] text-muted-foreground">not verified yet</span>
            )}
          </div>
          {prospect.verificationNotes ? (
            <p className="mt-2 text-[13px] leading-relaxed whitespace-pre-wrap text-foreground/90">
              {prospect.verificationNotes}
            </p>
          ) : null}
        </section>

        <section aria-label="Lifecycle dates" className="border-t pt-4">
          <SectionLabel>Lifecycle</SectionLabel>
          <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-2.5 sm:grid-cols-3">
            <Field label="Request sent">
              <DateLabel date={prospect.connectionRequestDate} />
            </Field>
            <Field label="Connected">
              <DateLabel date={prospect.connectionAcceptedDate} />
            </Field>
            <Field label="First message">
              <DateLabel date={prospect.firstMessageDate} />
            </Field>
            <Field label="Last contact">
              <DateLabel date={prospect.lastContactDate} />
            </Field>
            <Field label="Next follow-up">
              <span className="flex flex-wrap items-center gap-x-2">
                <DueDateLabel date={prospect.nextFollowUpDate} />
                {prospect.followUpCount > 0 ? (
                  <span className="font-num text-[11px] text-muted-foreground">
                    · {prospect.followUpCount} sent
                  </span>
                ) : null}
              </span>
            </Field>
          </dl>
        </section>

        <section aria-label="Activity timeline" className="border-t pt-4">
          <SectionLabel>Activity</SectionLabel>
          <div className="mt-2">
            <Timeline
              activities={prospect.activities}
              emptyLabel="No activity yet."
              emptyHint="Log the first research note or connection request."
              compact
            />
          </div>
        </section>
      </div>

      {/* Footer stats */}
      <div className="border-t px-4 py-2.5">
        <p className="text-[12px] text-muted-foreground">
          <span className="font-num font-medium text-foreground">{activityCount}</span> activit
          {activityCount === 1 ? "y" : "ies"}
          <span aria-hidden> · </span>
          <span className="font-num font-medium text-foreground">{prospect.followUpCount}</span>{" "}
          follow-up{prospect.followUpCount === 1 ? "" : "s"} sent
        </p>
      </div>

      {/* Confirmations */}
      <ConfirmDialog
        open={confirmKind === "archive"}
        onOpenChange={(open) => {
          if (!open) setConfirmKind(null);
        }}
        title="Archive prospect"
        description={`Archive ${fullName}?`}
        affectedCount={1}
        consequences="The record moves to Archive, its status is set to Archived, and a Status Change activity is recorded. Restorable from the Archive view."
        confirmLabel="Archive"
        onConfirm={() => archiveMutation.mutate("archive")}
      />
      <ConfirmDialog
        open={confirmKind === "unarchive"}
        onOpenChange={(open) => {
          if (!open) setConfirmKind(null);
        }}
        title="Restore prospect"
        description={`Restore ${fullName} to the active list?`}
        affectedCount={1}
        consequences="The record returns as Researching (if it was Archived) with a Status Change activity recording the restore."
        confirmLabel="Restore"
        onConfirm={() => archiveMutation.mutate("restore")}
      />
      <ConfirmDialog
        open={confirmKind === "delete"}
        onOpenChange={(open) => {
          if (!open) setConfirmKind(null);
        }}
        title="Delete prospect"
        description={`Permanently delete ${fullName}?`}
        affectedCount={1}
        consequences="Activities are deleted with the prospect. This cannot be undone."
        confirmLabel="Delete prospect"
        destructive
        onConfirm={() => deleteMutation.mutate()}
      />
    </>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
      {children}
    </h3>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="mt-0.5 text-[13px] leading-relaxed text-foreground/90">{children}</dd>
    </div>
  );
}

function MutedDash() {
  return <span className="text-muted-foreground/50">—</span>;
}
