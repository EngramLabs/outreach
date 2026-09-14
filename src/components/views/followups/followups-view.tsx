"use client";

// Follow-up queue (spec §16) — the operator's daily driver.
// The queue is derived server-side from every non-terminal prospect's next
// follow-up date. Actions here (complete / reschedule / skip) mutate the
// prospect, write the audit trail, and the queue re-derives on refetch.

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, startOfDay } from "date-fns";
import {
  ArrowUpRight,
  CalendarClock,
  Check,
  ListPlus,
  MoreVertical,
  Repeat,
  SkipForward,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { followUpsApi, prospectsApi, qk } from "@/lib/api-client";
import { FOLLOWUP_SHORTCUTS } from "@/lib/constants";
import type { FollowUpItem, ProspectRow } from "@/lib/types";
import { useAppStore } from "@/state/app-state";
import { DateLabel, DueDateLabel } from "@/components/shared/date-label";
import { PriorityBadge, StatusBadge } from "@/components/shared/status-badge";
import { EmptyState, ErrorState } from "@/components/shared/states";

type SectionKey = FollowUpItem["section"];
type FilterKey = "day" | SectionKey | "all";
type ScheduleAction = "reschedule" | "completeAndReschedule";

const SECTION_META: Record<SectionKey, { label: string; empty: string }> = {
  overdue: { label: "Overdue", empty: "Nothing overdue." },
  today: { label: "Today", empty: "No follow-ups today. You're clear." },
  tomorrow: { label: "Tomorrow", empty: "Nothing due tomorrow." },
  week: { label: "This week", empty: "Nothing due in the next 7 days." },
  upcoming: { label: "Upcoming", empty: "Nothing scheduled beyond this week." },
  nodate: {
    label: "No date",
    empty: "Prospects mid-outreach without a scheduled next step — schedule or close them out.",
  },
};

const SECTION_ORDER: SectionKey[] = ["overdue", "today", "tomorrow", "week", "upcoming", "nodate"];

const TABS: { key: FilterKey; label: string }[] = [
  { key: "day", label: "Overdue + Today" },
  { key: "overdue", label: "Overdue" },
  { key: "today", label: "Today" },
  { key: "tomorrow", label: "Tomorrow" },
  { key: "week", label: "This week" },
  { key: "upcoming", label: "Upcoming" },
  { key: "nodate", label: "No date" },
  { key: "all", label: "All sections" },
];

const ACTION_TITLE: Record<string, string> = {
  complete: "Follow-up completed",
  completeAndReschedule: "Follow-up completed and rescheduled",
  reschedule: "Follow-up rescheduled",
  skip: "Follow-up skipped",
};

// One shared column template keeps header labels and every row aligned.
const ROW_GRID =
  "md:grid md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_112px_92px_104px_44px_64px_184px] md:items-center md:gap-2.5";

const fullName = (p: ProspectRow): string =>
  `${p.firstName}${p.lastName ? ` ${p.lastName}` : ""}`;

/** Shortcut buttons + custom calendar, shared by popover (desktop) and dialog (mobile). */
function ScheduleControls({
  busy,
  onPick,
}: {
  busy: boolean;
  onPick: (date: Date) => void;
}) {
  return (
    <div>
      <div className="grid grid-cols-2 gap-1.5">
        {FOLLOWUP_SHORTCUTS.map((s) => (
          <Button
            key={s.label}
            type="button"
            variant="outline"
            size="sm"
            className="h-7 px-2.5 text-[12.5px]"
            disabled={busy}
            onClick={() => onPick(startOfDay(addDays(new Date(), s.days)))}
          >
            {s.label}
          </Button>
        ))}
      </div>
      <div className="mt-2 border-t pt-2">
        <Calendar
          mode="single"
          selected={undefined}
          onSelect={(d) => d && onPick(d)}
        />
      </div>
    </div>
  );
}

/** Optional-note skip form, shared by popover (desktop) and dialog (mobile). */
function SkipForm({
  note,
  onNoteChange,
  busy,
  onCancel,
  onConfirm,
}: {
  note: string;
  onNoteChange: (note: string) => void;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="space-y-2.5">
      <p className="text-[12.5px] leading-relaxed text-muted-foreground">
        Clears the scheduled date without logging a contact. The skip is noted in the activity log.
      </p>
      <Textarea
        rows={3}
        value={note}
        onChange={(e) => onNoteChange(e.target.value)}
        placeholder="Optional note — why skip?"
        aria-label="Skip note"
        className="text-[13px]"
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" size="sm" disabled={busy} onClick={onConfirm}>
          Skip
        </Button>
      </div>
    </div>
  );
}

function QueueSkeleton() {
  return (
    <div role="status" aria-label="Loading follow-up queue" className="rounded-md border bg-card">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex h-10 items-center gap-4 border-b px-3 last:border-b-0">
          <Skeleton className="h-4 w-44" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="ml-auto h-4 w-20" />
        </div>
      ))}
    </div>
  );
}

export function FollowUpsView() {
  const openProspect = useAppStore((s) => s.openProspect);
  const openActivityForm = useAppStore((s) => s.openActivityForm);
  const openProspectForm = useAppStore((s) => s.openProspectForm);
  const queryClient = useQueryClient();

  const [filter, setFilter] = useState<FilterKey>("day");

  // Desktop popovers (one open at a time) + mobile dialogs (opened from the
  // row "…" menu). Same controls, same mutation.
  const [scheduleTarget, setScheduleTarget] = useState<{ id: string; action: ScheduleAction } | null>(null);
  const [skipTarget, setSkipTarget] = useState<string | null>(null);
  const [mSchedule, setMSchedule] = useState<{ id: string; action: ScheduleAction } | null>(null);
  const [mSkip, setMSkip] = useState<string | null>(null);
  const [skipNote, setSkipNote] = useState("");

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: qk.followUps,
    queryFn: () => followUpsApi.queue(),
  });

  const actionMutation = useMutation({
    mutationFn: (v: { id: string; action: string; date?: string; notes?: string }) =>
      prospectsApi.followUpAction(v.id, { action: v.action, date: v.date, notes: v.notes }),
    onSuccess: (res, v) => {
      toast({
        title: ACTION_TITLE[v.action] ?? "Follow-up updated",
        description: res.effects.length ? res.effects.join(" · ") : undefined,
      });
      void queryClient.invalidateQueries({ queryKey: qk.followUps });
      void queryClient.invalidateQueries({ queryKey: ["prospect", v.id] });
      void queryClient.invalidateQueries({ queryKey: ["prospects"] });
      void queryClient.invalidateQueries({ queryKey: qk.dashboard });
      void queryClient.invalidateQueries({ queryKey: ["activities"] });
    },
    onError: (e) => {
      toast({
        title: "Could not update the follow-up",
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    },
  });

  const busyFor = (id: string) =>
    actionMutation.isPending && actionMutation.variables?.id === id;

  const runAction = (id: string, action: string, opts?: { date?: string; notes?: string }) => {
    actionMutation.mutate({ id, action, ...opts });
  };

  // --- Schedule (completeAndReschedule / reschedule) ------------------------

  const isScheduleOpen = (id: string, action: ScheduleAction) =>
    scheduleTarget?.id === id && scheduleTarget.action === action;

  const onScheduleOpenChange = (open: boolean, id: string, action: ScheduleAction) => {
    if (open) setScheduleTarget({ id, action });
    else if (scheduleTarget?.id === id && scheduleTarget.action === action) setScheduleTarget(null);
  };

  const pickPopoverDate = (date: Date) => {
    if (!scheduleTarget) return;
    const { id, action } = scheduleTarget;
    setScheduleTarget(null);
    runAction(id, action, { date: startOfDay(date).toISOString() });
  };

  const pickDialogDate = (date: Date) => {
    if (!mSchedule) return;
    const { id, action } = mSchedule;
    setMSchedule(null);
    runAction(id, action, { date: startOfDay(date).toISOString() });
  };

  // --- Skip ------------------------------------------------------------------

  const openSkip = (id: string) => {
    setSkipTarget(id);
    setSkipNote("");
  };

  const confirmPopoverSkip = () => {
    if (!skipTarget) return;
    const id = skipTarget;
    setSkipTarget(null);
    runAction(id, "skip", { notes: skipNote.trim() || undefined });
  };

  const openMobileSkip = (id: string) => {
    setMSkip(id);
    setSkipNote("");
  };

  const confirmMobileSkip = () => {
    if (!mSkip) return;
    const id = mSkip;
    setMSkip(null);
    runAction(id, "skip", { notes: skipNote.trim() || undefined });
  };

  // --- Derived sections -------------------------------------------------------

  const sections = useMemo(() => {
    const grouped: Record<SectionKey, FollowUpItem[]> = {
      overdue: [],
      today: [],
      tomorrow: [],
      week: [],
      upcoming: [],
      nodate: [],
    };
    for (const item of data?.items ?? []) grouped[item.section].push(item);
    return grouped;
  }, [data]);

  const shownSections: SectionKey[] =
    filter === "day"
      ? ["overdue", "today"]
      : filter === "all"
        ? SECTION_ORDER
        : [filter];

  const tabCount = (key: FilterKey): number => {
    if (!data) return 0;
    if (key === "day") return (data.counts.overdue ?? 0) + (data.counts.today ?? 0);
    if (key === "all") return data.items.length;
    return data.counts[key] ?? 0;
  };

  const tabCountDestructive = (key: FilterKey): boolean => {
    if (!data) return false;
    if (key === "overdue" || key === "day") return (data.counts.overdue ?? 0) > 0;
    return false;
  };

  function renderRow(item: FollowUpItem) {
    const p = item.prospect;
    const busy = busyFor(p.id);
    const name = fullName(p);
    return (
      <div
        key={p.id}
        className={cn(
          "flex flex-wrap items-center gap-x-2.5 gap-y-1 border-b px-3 py-2 last:border-b-0 md:h-11 md:py-0",
          ROW_GRID,
        )}
      >
        {/* Prospect + job title */}
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
          <button
            type="button"
            onClick={() => openProspect(p.id)}
            className="truncate text-[13px] font-medium hover:underline focus-visible:underline"
          >
            {name}
          </button>
          {p.jobTitle ? (
            <span className="truncate text-[12.5px] text-muted-foreground">{p.jobTitle}</span>
          ) : null}
        </div>

        {/* Company */}
        <span className="max-w-full truncate text-[13px] text-muted-foreground">
          {p.companyName ?? "—"}
        </span>

        {/* Status */}
        <div className="min-w-0">
          <StatusBadge status={p.status} />
        </div>

        {/* Last contact */}
        <div>
          <DateLabel date={p.lastContactDate} className="text-muted-foreground" />
        </div>

        {/* Due */}
        <div className="flex items-center gap-1.5">
          <DueDateLabel date={p.nextFollowUpDate} />
          {item.daysOverdue ? (
            <span
              className="font-num text-[11px] font-medium text-destructive"
              title="Days overdue"
            >
              {item.daysOverdue} d
            </span>
          ) : null}
        </div>

        {/* Follow-ups sent */}
        <span className="font-num text-[12.5px] text-muted-foreground" title="Follow-ups sent">
          ×{p.followUpCount}
        </span>

        {/* Priority */}
        <div>
          <PriorityBadge priority={p.priority} />
        </div>

        {/* Actions — desktop */}
        <div className="hidden items-center gap-0.5 md:flex">
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            disabled={busy}
            title="Complete"
            aria-label={`Complete follow-up for ${name}`}
            onClick={() => runAction(p.id, "complete")}
          >
            <Check aria-hidden className="size-4" />
          </Button>

          <Popover
            open={isScheduleOpen(p.id, "completeAndReschedule")}
            onOpenChange={(o) => onScheduleOpenChange(o, p.id, "completeAndReschedule")}
          >
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                disabled={busy}
                title="Complete and reschedule"
                aria-label={`Complete and reschedule follow-up for ${name}`}
              >
                <Repeat aria-hidden className="size-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-auto p-2">
              <p className="px-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Next follow-up
              </p>
              <ScheduleControls busy={busy} onPick={pickPopoverDate} />
            </PopoverContent>
          </Popover>

          <Popover
            open={isScheduleOpen(p.id, "reschedule")}
            onOpenChange={(o) => onScheduleOpenChange(o, p.id, "reschedule")}
          >
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                disabled={busy}
                title="Reschedule"
                aria-label={`Reschedule follow-up for ${name}`}
              >
                <CalendarClock aria-hidden className="size-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-auto p-2">
              <p className="px-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Reschedule to
              </p>
              <ScheduleControls busy={busy} onPick={pickPopoverDate} />
            </PopoverContent>
          </Popover>

          <Popover
            open={skipTarget === p.id}
            onOpenChange={(o) => (o ? openSkip(p.id) : setSkipTarget(null))}
          >
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                disabled={busy}
                title="Skip"
                aria-label={`Skip follow-up for ${name}`}
              >
                <SkipForward aria-hidden className="size-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-3">
              <SkipForm
                note={skipNote}
                onNoteChange={setSkipNote}
                busy={busy}
                onCancel={() => setSkipTarget(null)}
                onConfirm={confirmPopoverSkip}
              />
            </PopoverContent>
          </Popover>

          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            title="Open prospect"
            aria-label={`Open ${name}`}
            onClick={() => openProspect(p.id)}
          >
            <ArrowUpRight aria-hidden className="size-4" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            title="Log activity"
            aria-label={`Log activity for ${name}`}
            onClick={() => openActivityForm(p.id)}
          >
            <ListPlus aria-hidden className="size-4" />
          </Button>
        </div>

        {/* Actions — mobile (collapsed into "…" menu) */}
        <div className="ml-auto md:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8" aria-label="More actions">
                <MoreVertical aria-hidden className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem disabled={busy} onClick={() => runAction(p.id, "complete")}>
                <Check aria-hidden /> Complete
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setMSchedule({ id: p.id, action: "completeAndReschedule" })}
              >
                <Repeat aria-hidden /> Complete and reschedule…
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setMSchedule({ id: p.id, action: "reschedule" })}>
                <CalendarClock aria-hidden /> Reschedule…
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => openMobileSkip(p.id)}>
                <SkipForward aria-hidden /> Skip…
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => openProspect(p.id)}>
                <ArrowUpRight aria-hidden /> Open prospect
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => openActivityForm(p.id)}>
                <ListPlus aria-hidden /> Log activity
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="max-w-2xl text-[13px] text-muted-foreground">
        The queue builds itself from each prospect&apos;s next follow-up date. Complete,
        reschedule, or skip — every action updates the prospect record and audit log.
      </p>

      {/* Section filter tabs */}
      <div role="group" aria-label="Filter follow-up queue by section" className="flex flex-wrap items-center gap-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            aria-pressed={filter === t.key}
            onClick={() => setFilter(t.key)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-sm px-2 py-1 text-[13px] transition-colors",
              filter === t.key
                ? "bg-secondary font-medium text-secondary-foreground"
                : "text-muted-foreground hover:bg-surface-subtle hover:text-foreground",
            )}
          >
            {t.label}
            <span
              className={cn(
                "font-num text-[11px]",
                tabCountDestructive(t.key)
                  ? "font-medium text-destructive"
                  : "text-muted-foreground",
              )}
            >
              {tabCount(t.key)}
            </span>
          </button>
        ))}
      </div>

      {isPending ? (
        <QueueSkeleton />
      ) : isError ? (
        <ErrorState
          message={error instanceof Error ? error.message : "Could not load the follow-up queue."}
          onRetry={() => void refetch()}
        />
      ) : !data || data.items.length === 0 ? (
        <div className="rounded-md border bg-card">
          <EmptyState
            title="The follow-up queue is empty."
            description="Add prospects and schedule outreach — the queue builds itself from next follow-up dates."
            action={{ label: "Add prospects", onClick: () => openProspectForm(null) }}
          />
        </div>
      ) : (
        <>
          {/* Column labels (desktop) — same grid template as the rows */}
          <div className={cn("hidden px-3 pb-1", ROW_GRID)}>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Prospect
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Company
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Status
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Last contact
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Due
            </span>
            <span
              className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
              title="Follow-ups sent"
            >
              Sent
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Priority
            </span>
            <span className="sr-only">Actions</span>
          </div>

          {shownSections.map((key) => {
            const meta = SECTION_META[key];
            const items = sections[key];
            return (
              <section key={key} aria-label={`${meta.label} follow-ups`}>
                <h3
                  className={cn(
                    "mb-1 px-1 text-[11px] font-semibold uppercase tracking-wide",
                    key === "overdue" ? "text-destructive" : "text-muted-foreground",
                  )}
                >
                  {meta.label} — <span className="font-num">{items.length}</span>
                </h3>
                {key === "nodate" && items.length > 0 ? (
                  <p className="mb-1 px-1 text-[12px] text-muted-foreground">
                    Prospects mid-outreach without a scheduled next step — schedule or close them
                    out.
                  </p>
                ) : null}
                <div className="rounded-md border bg-card">
                  {items.length === 0 ? (
                    <p className="px-3 py-4 text-[13px] text-muted-foreground">{meta.empty}</p>
                  ) : (
                    items.map(renderRow)
                  )}
                </div>
              </section>
            );
          })}
        </>
      )}

      {/* Mobile dialogs — same controls as the desktop popovers */}
      <Dialog
        open={mSchedule !== null}
        onOpenChange={(o) => {
          if (!o) setMSchedule(null);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {mSchedule?.action === "reschedule" ? "Reschedule" : "Complete and reschedule"}
            </DialogTitle>
            <DialogDescription>Pick the next follow-up date.</DialogDescription>
          </DialogHeader>
          <ScheduleControls
            busy={mSchedule ? busyFor(mSchedule.id) : false}
            onPick={pickDialogDate}
          />
        </DialogContent>
      </Dialog>

      <Dialog
        open={mSkip !== null}
        onOpenChange={(o) => {
          if (!o) setMSkip(null);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Skip follow-up</DialogTitle>
            <DialogDescription>
              Clears the scheduled date without logging a contact.
            </DialogDescription>
          </DialogHeader>
          <SkipForm
            note={skipNote}
            onNoteChange={setSkipNote}
            busy={mSkip ? busyFor(mSkip) : false}
            onCancel={() => setMSkip(null)}
            onConfirm={confirmMobileSkip}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
