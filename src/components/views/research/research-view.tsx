"use client";

// Research queue (spec §17) — the rapid pre-outreach review workspace.
// One row per prospect; research context (notes / outreach angle) is hidden
// behind an expand toggle (progressive disclosure). Every tab is its own
// query (qk.research(stage)); counts come from the API, never fabricated.

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, CheckCircle2, ChevronRight, Linkedin, Pencil, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { VerificationBadge } from "@/components/shared/status-badge";
import { DateLabel } from "@/components/shared/date-label";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { prospectsApi, qk, researchApi } from "@/lib/api-client";
import type { ProspectRow } from "@/lib/types";
import { useAppStore } from "@/state/app-state";

type ResearchRow = ProspectRow & {
  researchNotes: string | null;
  outreachAngle: string | null;
};

type StageKey = "researching" | "verification" | "verified" | "ready" | "rejected" | "all";

const STAGE_ORDER: StageKey[] = [
  "researching",
  "verification",
  "verified",
  "ready",
  "rejected",
  "all",
];

const STAGE_META: Record<StageKey, { label: string; empty: string }> = {
  researching: { label: "Researching", empty: "Nothing in Researching right now." },
  verification: { label: "Needs Verification", empty: "Nothing in Needs Verification right now." },
  verified: { label: "Verified", empty: "Nothing in Verified right now." },
  ready: { label: "Ready", empty: "Nothing in Ready right now." },
  rejected: { label: "Rejected", empty: "Nothing in Rejected right now." },
  all: { label: "All", empty: "No prospects in the research queue." },
};

// "Move to Ready" only makes sense before a prospect is verified/cleared.
const SHOW_READY_FOR: StageKey[] = ["researching", "verification", "all"];

const ROW_GRID =
  "md:grid md:grid-cols-[26px_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.9fr)_104px_48px_88px_184px] md:items-center md:gap-2.5";

const fullName = (p: ProspectRow): string =>
  `${p.firstName}${p.lastName ? ` ${p.lastName}` : ""}`;

function ResearchSkeleton() {
  return (
    <div role="status" aria-label="Loading research queue" className="rounded-md border bg-card">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex h-10 items-center gap-4 border-b px-3 last:border-b-0">
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="ml-auto h-4 w-16" />
          <Skeleton className="h-4 w-14" />
        </div>
      ))}
    </div>
  );
}

/** Expanded inset panel: research context per prospect. */
function ResearchPanel({ row }: { row: ResearchRow }) {
  return (
    <div className="bg-surface-subtle px-3 py-2 text-[13px]">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Research notes
          </p>
          <p className="mt-0.5 leading-relaxed whitespace-pre-wrap">
            {row.researchNotes ?? <span className="text-muted-foreground/60">—</span>}
          </p>
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Outreach angle
          </p>
          <p className="mt-0.5 leading-relaxed whitespace-pre-wrap">
            {row.outreachAngle ?? <span className="text-muted-foreground/60">—</span>}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Added
          </p>
          <DateLabel date={row.dateAdded} className="mt-0.5 block text-muted-foreground" />
        </div>
      </div>
    </div>
  );
}

export function ResearchView() {
  const openProspect = useAppStore((s) => s.openProspect);
  const openProspectForm = useAppStore((s) => s.openProspectForm);
  const openVerifyForm = useAppStore((s) => s.openVerifyForm);
  const queryClient = useQueryClient();

  const [stage, setStage] = useState<StageKey>("all");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [rejectTarget, setRejectTarget] = useState<ResearchRow | null>(null);

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: qk.research(stage),
    queryFn: () => researchApi.queue(stage),
  });

  const statusMutation = useMutation({
    mutationFn: (v: { id: string; status: string; name?: string }) =>
      prospectsApi.update(v.id, { status: v.status }),
    onSuccess: (_updated, v) => {
      toast({
        title:
          v.status === "Ready"
            ? "Moved to Ready"
            : v.status === "Not Interested"
              ? "Marked Not Interested"
              : "Status updated",
        description: v.name,
      });
      void queryClient.invalidateQueries({ queryKey: ["research"] });
      void queryClient.invalidateQueries({ queryKey: ["prospect", v.id] });
      void queryClient.invalidateQueries({ queryKey: ["prospects"] });
      void queryClient.invalidateQueries({ queryKey: qk.dashboard });
      void queryClient.invalidateQueries({ queryKey: ["activities"] });
    },
    onError: (e) => {
      toast({
        title: "Could not update the status",
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    },
  });

  const busyFor = (id: string) =>
    statusMutation.isPending && statusMutation.variables?.id === id;

  const toggleExpanded = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  function renderRow(row: ResearchRow) {
    const busy = busyFor(row.id);
    const name = fullName(row);
    const isExpanded = expanded.has(row.id);
    return (
      <div key={row.id} className="border-b last:border-b-0">
        <div
          className={cn(
            "flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 md:h-11 md:py-0",
            ROW_GRID,
          )}
        >
          {/* Expand toggle */}
          <Button
            variant="ghost"
            size="icon"
            className="size-6 shrink-0"
            aria-expanded={isExpanded}
            aria-label={isExpanded ? `Hide research notes for ${name}` : `Show research notes for ${name}`}
            title={isExpanded ? "Hide research notes" : "Show research notes"}
            onClick={() => toggleExpanded(row.id)}
          >
            <ChevronRight
              aria-hidden
              className={cn("size-3.5 transition-transform", isExpanded && "rotate-90")}
            />
          </Button>

          {/* Prospect + job title */}
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
            <button
              type="button"
              onClick={() => openProspect(row.id)}
              className="truncate text-[13px] font-medium hover:underline focus-visible:underline"
            >
              {name}
            </button>
            {row.jobTitle ? (
              <span className="truncate text-[12.5px] text-muted-foreground">{row.jobTitle}</span>
            ) : null}
          </div>

          {/* Company */}
          <span className="max-w-full truncate text-[13px] text-muted-foreground">
            {row.companyName ?? "—"}
          </span>

          {/* Source */}
          <span className="max-w-full truncate text-[12.5px] text-muted-foreground">
            {row.source ?? "—"}
          </span>

          {/* Verification */}
          <div className="min-w-0">
            <VerificationBadge status={row.verificationStatus} />
          </div>

          {/* Fit score */}
          <span className="font-num text-[13px]" title="Fit score">
            {row.fitScore ?? <span className="text-muted-foreground/50">—</span>}
          </span>

          {/* LinkedIn */}
          {row.linkedinUrl ? (
            <a
              href={row.linkedinUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label={`Open LinkedIn profile of ${name}`}
              title="Open LinkedIn profile"
            >
              <Linkedin aria-hidden className="size-4" />
            </a>
          ) : (
            <span className="text-[11.5px] text-muted-foreground/70">no LinkedIn</span>
          )}

          {/* Actions */}
          <div className="flex w-full items-center gap-1 pt-1 md:w-auto md:flex-nowrap md:gap-0.5 md:pt-0">
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2.5 text-[12.5px]"
              disabled={busy}
              onClick={() => openVerifyForm(row.id)}
            >
              Verify
            </Button>
            {SHOW_READY_FOR.includes(stage) ? (
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                disabled={busy}
                title="Move to Ready"
                aria-label={`Move ${name} to Ready`}
                onClick={() =>
                  statusMutation.mutate({ id: row.id, status: "Ready", name })
                }
              >
                <CheckCircle2 aria-hidden className="size-4" />
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              title="Edit prospect"
              aria-label={`Edit ${name}`}
              onClick={() => openProspectForm(row.id)}
            >
              <Pencil aria-hidden className="size-4" />
            </Button>
            {stage !== "rejected" ? (
              <Button
                variant="ghost"
                size="icon"
                className="size-7 hover:bg-destructive/10 hover:text-destructive"
                disabled={busy}
                title="Reject"
                aria-label={`Reject ${name}`}
                onClick={() => setRejectTarget(row)}
              >
                <X aria-hidden className="size-4" />
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              title="Open prospect"
              aria-label={`Open ${name}`}
              onClick={() => openProspect(row.id)}
            >
              <ArrowUpRight aria-hidden className="size-4" />
            </Button>
          </div>
        </div>
        {isExpanded ? <ResearchPanel row={row} /> : null}
      </div>
    );
  }

  const meta = STAGE_META[stage];

  return (
    <div className="space-y-3">
      <p className="max-w-2xl text-[13px] text-muted-foreground">
        Pre-outreach review: researching, verification, and ready prospects. Verify details,
        capture the angle, then clear them for outreach or reject.
      </p>

      {/* Stage tabs — each tab is its own query (qk.research(stage)) */}
      <div
        role="group"
        aria-label="Filter research queue by stage"
        className="flex flex-wrap items-center gap-1"
      >
        {STAGE_ORDER.map((key) => {
          const active = stage === key;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={active}
              onClick={() => setStage(key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-sm px-2 py-1 text-[13px] transition-colors",
                active
                  ? "bg-secondary font-medium text-secondary-foreground"
                  : "text-muted-foreground hover:bg-surface-subtle hover:text-foreground",
              )}
            >
              {STAGE_META[key].label}
              {active && data ? (
                <span className="font-num text-[11px] text-muted-foreground">
                  {data.counts.total}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Summary strip — real counts from the current stage's response */}
      {data ? (
        <p className="font-num text-[12.5px] text-muted-foreground">
          {data.counts.total} records · missing LinkedIn: {data.counts.missingLinkedin} · missing
          company: {data.counts.missingCompany} · unverified: {data.counts.unverified}
        </p>
      ) : null}

      {isPending ? (
        <ResearchSkeleton />
      ) : isError ? (
        <ErrorState
          message={error instanceof Error ? error.message : "Could not load the research queue."}
          onRetry={() => void refetch()}
        />
      ) : !data || data.data.length === 0 ? (
        <div className="rounded-md border bg-card">
          <EmptyState
            title={meta.empty}
            description={
              stage === "all"
                ? "Add prospects and move them into Researching to start pre-outreach work."
                : undefined
            }
            action={
              stage === "all"
                ? { label: "Add prospects", onClick: () => openProspectForm(null) }
                : undefined
            }
          />
        </div>
      ) : (
        <>
          {/* Column labels (desktop) — same grid template as the rows */}
          <div className={cn("hidden px-3 pb-1", ROW_GRID)}>
            <span className="sr-only">Expand research notes</span>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Prospect
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Company
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Source
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Verification
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Fit
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              LinkedIn
            </span>
            <span className="sr-only">Actions</span>
          </div>

          <div className="rounded-md border bg-card">{data.data.map(renderRow)}</div>
        </>
      )}

      <ConfirmDialog
        open={rejectTarget !== null}
        onOpenChange={(o) => {
          if (!o) setRejectTarget(null);
        }}
        title="Reject this prospect?"
        description="Marks them Not Interested. Keep the record for context — you can change status later."
        confirmLabel="Reject"
        destructive
        onConfirm={() => {
          if (!rejectTarget) return;
          const t = rejectTarget;
          setRejectTarget(null);
          statusMutation.mutate({ id: t.id, status: "Not Interested", name: fullName(t) });
        }}
      />
    </div>
  );
}
