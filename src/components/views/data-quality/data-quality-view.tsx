"use client";

// Data Quality (spec §19) — a computed scan, not a stored table. Every issue
// carries a direct fix: merge duplicates, or jump to the exact filtered list
// of offending records. Dismissals are reversible and always explained.

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, EyeOff, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { DQSeverityBadge } from "@/components/shared/status-badge";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import {
  EmptyState,
  ErrorState,
  SectionHeader,
  TableSkeleton,
} from "@/components/shared/states";
import { timeAgo } from "@/components/shared/date-label";
import { dataQualityApi, qk } from "@/lib/api-client";
import type { DataQualityIssue, ProspectsQuery } from "@/lib/types";
import { useAppStore } from "@/state/app-state";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// fix resolution
// ---------------------------------------------------------------------------

interface IssueFix {
  label: string;
  navigates: boolean;
  run: () => void;
}

const ROW_FOCUS =
  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring";

/** Interprets a fixHref into a concrete action against the app store. */
function resolveFix(
  issue: DataQualityIssue,
  openMergeForm: (ids: string[]) => void,
  setView: (view: "prospects" | "companies", preset?: Partial<ProspectsQuery>) => void,
): IssueFix | null {
  const href = issue.fixHref;
  if (!href) return null;

  if (href.startsWith("merge:")) {
    const ids = href
      .slice("merge:".length)
      .split(",")
      .filter(Boolean);
    if (ids.length === 0) return null;
    return {
      label: issue.fixLabel,
      navigates: false,
      run: () => openMergeForm(ids),
    };
  }

  if (href.startsWith("prospects?")) {
    const params = new URLSearchParams(href.slice("prospects?".length));
    const preset: Partial<ProspectsQuery> = {};
    const ids = params.get("ids");
    const missing = params.get("missing");
    const invalid = params.get("invalid");
    const issueKey = params.get("issue");
    if (ids) preset.ids = ids;
    if (missing) preset.missing = missing;
    if (invalid) preset.invalid = invalid;
    if (issueKey) preset.issue = issueKey;
    return {
      label: issue.fixLabel,
      navigates: true,
      run: () => setView("prospects", preset),
    };
  }

  if (href.startsWith("companies")) {
    // The companies view takes no presets — plain navigation is fine.
    return {
      label: issue.fixLabel,
      navigates: true,
      run: () => setView("companies"),
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// view
// ---------------------------------------------------------------------------

export function DataQualityView() {
  const setView = useAppStore((s) => s.setView);
  const openMergeForm = useAppStore((s) => s.openMergeForm);
  const queryClient = useQueryClient();

  const [dismissedOpen, setDismissedOpen] = useState(false);
  const [confirmDismiss, setConfirmDismiss] = useState<DataQualityIssue | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: qk.dataQuality,
    queryFn: () => dataQualityApi.get(),
  });

  const actionMutation = useMutation({
    mutationFn: (vars: { action: "dismiss" | "restore" | "reset"; key?: string }) =>
      dataQualityApi.action(vars.action, vars.key),
    onSuccess: (_result, vars) => {
      void queryClient.invalidateQueries({ queryKey: qk.dataQuality });
      if (vars.action === "dismiss") {
        toast({
          title: "Issue dismissed",
          description: "The records are untouched — you can restore it below at any time.",
        });
      } else if (vars.action === "restore") {
        toast({ title: "Issue restored", description: "It is back in the open list." });
      } else {
        toast({
          title: "Dismissed issues restored",
          description: "Every dismissed issue is open again.",
        });
      }
    },
    onError: (err: Error) => {
      toast({
        title: "Action failed",
        description: err.message || "The data-quality action could not be completed.",
        variant: "destructive",
      });
    },
  });

  function dismissIssue(issue: DataQualityIssue) {
    if (issue.severity === "high") {
      setConfirmDismiss(issue);
    } else {
      actionMutation.mutate({ action: "dismiss", key: issue.key });
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <SectionHeader
          title="Data Quality"
          description="A computed scan of your records — duplicates, missing fields, and inconsistent dates."
        />
        <TableSkeleton rows={6} cols={2} />
        <TableSkeleton rows={3} cols={2} />
      </div>
    );
  }

  if (error) {
    return (
      <ErrorState
        message={error.message || "The data-quality scan could not be loaded."}
        onRetry={() => refetch()}
        className="mt-4"
      />
    );
  }

  if (!data) return null;

  const openIssues = data.issues.filter((issue) => !issue.dismissed);
  const dismissedIssues = data.issues.filter((issue) => issue.dismissed);
  const pending = actionMutation.isPending;

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Data Quality"
        description="A computed scan of your records — every issue comes with a direct fix."
        actions={
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => refetch()}
              disabled={isFetching}
              aria-label="Re-run the data-quality scan"
            >
              <RefreshCw className={cn(isFetching && "animate-spin")} aria-hidden />
              Re-scan
            </Button>
            {dismissedIssues.length > 0 ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setConfirmReset(true)}
                disabled={pending}
              >
                Restore dismissed
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-[12.5px] text-muted-foreground">
          <span className="font-num text-foreground">{data.checkedProspects}</span> prospects ·{" "}
          <span className="font-num text-foreground">{data.checkedCompanies}</span> companies
          scanned · <span className="font-num text-foreground">{openIssues.length}</span> open
          {dismissedIssues.length > 0 ? (
            <>
              {" · "}
              <span className="font-num text-foreground">{dismissedIssues.length}</span> dismissed
            </>
          ) : null}
        </p>
        <p className="text-[12px] text-muted-foreground">Scanned {timeAgo(data.generatedAt)}</p>
      </div>

      {/* Issue list — severity high → low, already sorted by the API */}
      {openIssues.length === 0 && dismissedIssues.length === 0 ? (
        <div className="rounded-md border bg-card">
          <EmptyState
            title={`No data quality issues found. ${data.checkedProspects} records scanned.`}
            description="The scan checks for duplicate prospects and companies, missing key fields, invalid LinkedIn URLs, and status/date mismatches. Re-scan after imports or bulk edits."
          />
        </div>
      ) : openIssues.length === 0 ? (
        <div className="rounded-md border bg-card">
          <p className="px-3 py-6 text-center text-[13px] text-muted-foreground">
            No open issues — every finding has been dismissed.
          </p>
        </div>
      ) : (
        <div className="rounded-md border bg-card">
          {openIssues.map((issue) => {
            const fix = resolveFix(issue, openMergeForm, setView);
            // "View records" only differs from Fix when the fix opens a dialog
            // instead of navigating — otherwise it would be the same action.
            const recordIds = issue.prospectIds ?? [];
            const viewRecords =
              fix && fix.navigates
                ? null
                : recordIds.length > 0
                  ? {
                      run: () =>
                        setView("prospects", { ids: recordIds.join(",") } as Partial<ProspectsQuery>),
                    }
                  : null;
            return (
              <div
                key={issue.key}
                className="flex flex-col gap-2 border-b px-3 py-3 last:border-0 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <DQSeverityBadge severity={issue.severity} />
                    <h3 className="text-[13px] font-medium text-foreground">{issue.title}</h3>
                  </div>
                  <p className="text-[12.5px] leading-relaxed text-muted-foreground">
                    {issue.description}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                  {fix ? (
                    <Button
                      size="sm"
                      variant={issue.severity === "high" ? "default" : "outline"}
                      onClick={fix.run}
                    >
                      {fix.label}
                    </Button>
                  ) : null}
                  {viewRecords ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={viewRecords.run}
                      aria-label={`View the ${recordIds.length} records behind this issue`}
                    >
                      View records
                    </Button>
                  ) : null}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-8 text-muted-foreground"
                    onClick={() => dismissIssue(issue)}
                    disabled={pending}
                    aria-label={`Dismiss issue: ${issue.title}`}
                    title="Dismiss issue"
                  >
                    <EyeOff aria-hidden />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Dismissed issues — collapsed by default, always reversible */}
      {dismissedIssues.length > 0 ? (
        <Collapsible open={dismissedOpen} onOpenChange={setDismissedOpen}>
          <div className="flex items-center border-t pt-4">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="text-muted-foreground">
                {dismissedOpen ? (
                  <ChevronDown aria-hidden />
                ) : (
                  <ChevronRight aria-hidden />
                )}
                Dismissed ({dismissedIssues.length})
              </Button>
            </CollapsibleTrigger>
          </div>
          <CollapsibleContent>
            <div className="mt-2 overflow-hidden rounded-md border bg-surface-subtle/50">
              {dismissedIssues.map((issue) => (
                <div
                  key={issue.key}
                  className="flex items-center justify-between gap-3 border-b px-3 py-2 last:border-0"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <DQSeverityBadge severity={issue.severity} />
                    <span className="truncate text-[12.5px] text-muted-foreground" title={issue.title}>
                      {issue.title}
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => actionMutation.mutate({ action: "restore", key: issue.key })}
                    disabled={pending}
                  >
                    Restore
                  </Button>
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      ) : null}

      {/* Confirmations */}
      <ConfirmDialog
        open={confirmDismiss !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmDismiss(null);
        }}
        title="Dismiss this issue?"
        description="The underlying records stay exactly as they are — the issue just stops appearing in the open list."
        affectedCount={confirmDismiss?.prospectCount ?? confirmDismiss?.companyCount}
        consequences="You can restore it from the dismissed section below at any time."
        confirmLabel="Dismiss issue"
        onConfirm={() => {
          if (confirmDismiss) {
            actionMutation.mutate({ action: "dismiss", key: confirmDismiss.key });
          }
          setConfirmDismiss(null);
        }}
      />
      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Restore all dismissed issues?"
        description="Every dismissed issue returns to the open list."
        affectedCount={dismissedIssues.length}
        consequences="Nothing changes in your records — this only affects the scan results."
        confirmLabel="Restore all"
        onConfirm={() => {
          actionMutation.mutate({ action: "reset" });
          setConfirmReset(false);
        }}
      />
    </div>
  );
}
