"use client";

// Activity log (spec §15) — the audit trail. Every logged touch and every
// automated status change, newest first, filterable by type / date range /
// free-text search (server-side). Deleting an entry only removes the log
// line — prospect state is never recalculated (stated in the confirm).

import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, ListPlus, Search, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ActivityTypeBadge } from "@/components/shared/status-badge";
import { DateLabel } from "@/components/shared/date-label";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/shared/states";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { activitiesApi, qk } from "@/lib/api-client";
import { ACTIVITY_TYPES } from "@/lib/constants";
import type { ActivityItem } from "@/lib/types";
import { useAppStore } from "@/state/app-state";

const PAGE_SIZE = 50;

const TH_CLASS =
  "px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";

/** Notes or message text, truncated, full text on hover. Message text is italic. */
function DetailsCell({ activity }: { activity: ActivityItem }) {
  const text = activity.notes ?? activity.messageText;
  if (!text) return <span className="text-muted-foreground/50">—</span>;
  const truncated = text.length > 80 ? `${text.slice(0, 80)}…` : text;
  return (
    <span
      className={cn(
        "block max-w-[220px] truncate md:max-w-[360px]",
        activity.notes === null && "italic",
      )}
      title={text}
    >
      {truncated}
    </span>
  );
}

/** Compact page list: all pages when few, windowed with gaps when many. */
function pageList(current: number, pageCount: number): (number | "gap")[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
  const out: (number | "gap")[] = [1];
  if (current > 3) out.push("gap");
  for (let i = Math.max(2, current - 1); i <= Math.min(pageCount - 1, current + 1); i++) {
    out.push(i);
  }
  if (current < pageCount - 2) out.push("gap");
  out.push(pageCount);
  return out;
}

export function ActivitiesView() {
  const openActivityForm = useAppStore((s) => s.openActivityForm);
  const openProspect = useAppStore((s) => s.openProspect);
  const queryClient = useQueryClient();

  const [type, setType] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<ActivityItem | null>(null);

  // Debounce the search box; a new search restarts from page 1.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQuery(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const params = useMemo(() => {
    const p: Parameters<typeof activitiesApi.list>[0] = { page, pageSize: PAGE_SIZE };
    if (type !== "all") p.type = type;
    // Native date inputs give yyyy-mm-dd — make the range inclusive of both days.
    if (from) p.from = `${from}T00:00:00`;
    if (to) p.to = `${to}T23:59:59`;
    if (debouncedQuery) p.query = debouncedQuery;
    return p;
  }, [type, from, to, debouncedQuery, page]);

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: qk.activities(params),
    queryFn: () => activitiesApi.list(params),
    placeholderData: keepPreviousData,
  });

  // A page can fall out of range when deletions shrink the result set
  // (filters already reset the page). Detected here and recovered with an
  // explicit action — no state-syncing effect.
  const pageOutOfRange = data !== undefined && data.total > 0 && data.data.length === 0;

  const deleteMutation = useMutation({
    mutationFn: (id: string) => activitiesApi.remove(id),
    onSuccess: () => {
      toast({ title: "Activity deleted" });
      setDeleteTarget(null);
      void queryClient.invalidateQueries({ queryKey: ["activities"] });
      void queryClient.invalidateQueries({ queryKey: ["prospect"] });
      void queryClient.invalidateQueries({ queryKey: ["prospects"] });
      void queryClient.invalidateQueries({ queryKey: qk.dashboard });
    },
    onError: (e) => {
      toast({
        title: "Could not delete the activity",
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    },
  });

  const hasActiveFilters =
    type !== "all" || from !== "" || to !== "" || debouncedQuery !== "";

  const clearFilters = () => {
    setType("all");
    setFrom("");
    setTo("");
    setSearchInput("");
    setDebouncedQuery("");
    setPage(1);
  };

  const confirmDelete = () => {
    if (!deleteTarget || deleteMutation.isPending) return;
    deleteMutation.mutate(deleteTarget.id);
  };

  const showStart = data && data.data.length > 0 ? (page - 1) * PAGE_SIZE + 1 : 0;
  const showEnd = data ? Math.min(page * PAGE_SIZE, data.total) : 0;

  return (
    <div className="space-y-3">
      <p className="max-w-2xl text-[13px] text-muted-foreground">
        Every logged touch and automated status change, newest first. Deleting an entry only
        removes the log line — prospect status and dates are never recalculated.
      </p>

      {/* Toolbar */}
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-44">
          <label
            htmlFor="activity-type"
            className="mb-1 block text-[11px] font-medium text-muted-foreground"
          >
            Type
          </label>
          <Select
            value={type}
            onValueChange={(v) => {
              setType(v);
              setPage(1);
            }}
          >
            <SelectTrigger id="activity-type" size="sm" className="w-full text-[13px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {ACTIVITY_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="w-[150px]">
          <label
            htmlFor="activity-from"
            className="mb-1 block text-[11px] font-medium text-muted-foreground"
          >
            From
          </label>
          <Input
            id="activity-from"
            type="date"
            className="h-8 font-num text-[13px]"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
          />
        </div>

        <div className="w-[150px]">
          <label
            htmlFor="activity-to"
            className="mb-1 block text-[11px] font-medium text-muted-foreground"
          >
            To
          </label>
          <Input
            id="activity-to"
            type="date"
            className="h-8 font-num text-[13px]"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
          />
        </div>

        <div className="min-w-44 flex-1 sm:max-w-64">
          <label
            htmlFor="activity-search"
            className="mb-1 block text-[11px] font-medium text-muted-foreground"
          >
            Search
          </label>
          <div className="relative">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id="activity-search"
              className="h-8 pl-8 text-[13px]"
              placeholder="Notes, messages, prospect name…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              autoComplete="off"
              type="search"
            />
          </div>
        </div>

        {type !== "all" || from !== "" || to !== "" || searchInput !== "" ? (
          <Button variant="ghost" size="sm" className="h-8" onClick={clearFilters}>
            Clear filters
          </Button>
        ) : null}

        <Button
          size="sm"
          className="ml-auto h-8"
          onClick={() => openActivityForm(null)}
        >
          <ListPlus aria-hidden className="size-3.5" />
          Log activity
        </Button>
      </div>

      {/* Log table */}
      {isPending ? (
        <TableSkeleton rows={8} cols={5} />
      ) : isError ? (
        <ErrorState
          message={error instanceof Error ? error.message : "Could not load the activity log."}
          onRetry={() => void refetch()}
        />
      ) : !data || data.data.length === 0 ? (
        <div className="rounded-md border bg-card">
          {pageOutOfRange && data ? (
            <EmptyState
              title="This page is out of range."
              description={`The log now has ${data.pageCount} page${data.pageCount === 1 ? "" : "s"}.`}
              action={{ label: "Go to last page", onClick: () => setPage(data.pageCount) }}
            />
          ) : hasActiveFilters ? (
            <EmptyState
              title="No activities match these filters."
              description="Widen the date range, clear the type, or clear the search."
            />
          ) : (
            <EmptyState
              title="No activities yet."
              description="Every logged touch — messages, replies, meetings, notes — lands here."
              action={{ label: "Log activity", onClick: () => openActivityForm(null) }}
            />
          )}
        </div>
      ) : (
        <>
          <div className="scroll-slim overflow-x-auto rounded-md border bg-card">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b bg-surface-subtle/60">
                  <th scope="col" className={cn(TH_CLASS, "whitespace-nowrap")}>
                    Date
                  </th>
                  <th scope="col" className={cn(TH_CLASS, "whitespace-nowrap")}>
                    Type
                  </th>
                  <th scope="col" className={cn(TH_CLASS, "whitespace-nowrap")}>
                    Prospect
                  </th>
                  <th scope="col" className={cn(TH_CLASS, "hidden whitespace-nowrap md:table-cell")}>
                    Company
                  </th>
                  <th scope="col" className={cn(TH_CLASS, "hidden whitespace-nowrap md:table-cell")}>
                    Campaign
                  </th>
                  <th scope="col" className={TH_CLASS}>
                    Details
                  </th>
                  <th scope="col" className={cn(TH_CLASS, "hidden md:table-cell")}>
                    Auto
                  </th>
                  <th scope="col" className="w-10">
                    <span className="sr-only">Delete</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((a) => (
                  <tr key={a.id} className="border-b last:border-0 hover:bg-surface-subtle/50">
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      <DateLabel date={a.occurredAt} />
                    </td>
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      <ActivityTypeBadge type={a.activityType} />
                    </td>
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      {a.prospectName ? (
                        <button
                          type="button"
                          className="font-medium hover:underline focus-visible:underline"
                          onClick={() => openProspect(a.prospectId)}
                        >
                          {a.prospectName}
                        </button>
                      ) : (
                        <span className="text-muted-foreground/50">—</span>
                      )}
                    </td>
                    <td className="hidden px-3 py-1.5 whitespace-nowrap text-muted-foreground md:table-cell">
                      {a.companyName ?? "—"}
                    </td>
                    <td className="hidden px-3 py-1.5 whitespace-nowrap text-muted-foreground md:table-cell">
                      {a.campaignName ?? "—"}
                    </td>
                    <td className="px-3 py-1.5">
                      <DetailsCell activity={a} />
                    </td>
                    <td className="hidden px-3 py-1.5 md:table-cell">
                      {a.autoGenerated ? (
                        <span
                          className="text-[11px] text-muted-foreground"
                          title="Recorded automatically by status automation"
                        >
                          auto
                        </span>
                      ) : null}
                    </td>
                    <td className="px-2 py-1.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        aria-label={
                          a.prospectName
                            ? `Delete activity for ${a.prospectName}`
                            : "Delete activity"
                        }
                        title="Delete"
                        onClick={() => setDeleteTarget(a)}
                      >
                        <Trash2 aria-hidden className="size-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination footer */}
          <nav
            aria-label="Activity log pages"
            className="flex flex-wrap items-center justify-between gap-2"
          >
            <p className="font-num text-[12.5px] text-muted-foreground">
              Showing {showStart}–{showEnd} of {data.total}
            </p>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="size-7"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                aria-label="Previous page"
              >
                <ChevronLeft aria-hidden className="size-4" />
              </Button>
              {pageList(page, data.pageCount).map((n, i) =>
                n === "gap" ? (
                  <span key={`gap-${i}`} aria-hidden className="px-1 text-[12px] text-muted-foreground">
                    …
                  </span>
                ) : (
                  <button
                    key={n}
                    type="button"
                    aria-label={`Page ${n}`}
                    aria-current={n === page ? "page" : undefined}
                    onClick={() => setPage(n)}
                    className={cn(
                      "h-7 min-w-7 rounded-sm px-1 font-num text-[12px] transition-colors",
                      n === page
                        ? "bg-secondary font-medium text-secondary-foreground"
                        : "text-muted-foreground hover:bg-surface-subtle hover:text-foreground",
                    )}
                  >
                    {n}
                  </button>
                ),
              )}
              <Button
                variant="outline"
                size="icon"
                className="size-7"
                disabled={page >= data.pageCount}
                onClick={() => setPage((p) => Math.min(data.pageCount, p + 1))}
                aria-label="Next page"
              >
                <ChevronRight aria-hidden className="size-4" />
              </Button>
            </div>
          </nav>
        </>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null);
        }}
        title="Delete this activity?"
        description="The prospect's status and dates are not recalculated — only the log entry is removed."
        confirmLabel="Delete"
        destructive
        onConfirm={confirmDelete}
      />
    </div>
  );
}
