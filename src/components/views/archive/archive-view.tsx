"use client";

// Archive — restorable records. Read-only list of archived prospects with
// bulk restore, per-row permanent delete, search and pagination. Restores go
// through the same auditable bulk action as everywhere else.

import { useEffect, useMemo, useState } from "react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArchiveRestore, ChevronLeft, ChevronRight, Search, Trash2, X } from "lucide-react";
import { archiveApi, prospectsApi, qk } from "@/lib/api-client";
import { useAppStore } from "@/state/app-state";
import { toast } from "@/hooks/use-toast";
import type { ProspectRow } from "@/lib/types";
import { StatusBadge, PriorityBadge } from "@/components/shared/status-badge";
import { DateLabel } from "@/components/shared/date-label";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/shared/states";

/** Page size returned by /api/archive. */
const PAGE_SIZE = 50;

function fullName(p: ProspectRow): string {
  return `${p.firstName} ${p.lastName ?? ""}`.trim();
}

export function ArchiveView() {
  const queryClient = useQueryClient();
  const openProspect = useAppStore((s) => s.openProspect);

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProspectRow | null>(null);

  // Debounced search (name / company). Committing a new search restarts
  // from page one with a clean selection — one user action, applied together
  // in the timer callback (not in the effect body).
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQuery(query.trim());
      setPage(1);
      setSelected(new Set());
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: qk.archive(page, debouncedQuery),
    queryFn: () => archiveApi.list(page, debouncedQuery || undefined),
    placeholderData: keepPreviousData,
  });

  const rows = data?.data ?? [];
  const total = data?.total ?? 0;
  const pageCount = data?.pageCount ?? 1;

  /** Pagination moves are user actions: page change + selection reset together. */
  function goToPage(next: number) {
    setPage(next);
    setSelected(new Set());
  }

  /** If a mutation empties the current page, step back one page. */
  function stepBackIfPageEmpties(removedIds: Set<string>) {
    const remaining = rows.filter((r) => !removedIds.has(r.id)).length;
    if (remaining === 0 && page > 1) setPage(page - 1);
  }

  const allSelected = rows.length > 0 && rows.every((p) => selected.has(p.id));
  const someSelected = rows.some((p) => selected.has(p.id));

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => {
      if (allSelected) return new Set();
      const next = new Set(prev);
      for (const p of rows) next.add(p.id);
      return next;
    });
  }

  const invalidateAfterMutation = () => {
    void queryClient.invalidateQueries({ queryKey: ["prospects"] });
    void queryClient.invalidateQueries({ queryKey: qk.dashboard });
    void queryClient.invalidateQueries({ queryKey: ["archive"] });
  };

  const restoreMutation = useMutation({
    mutationFn: (ids: string[]) =>
      prospectsApi.bulk({ ids, action: "restore" }),
    onSuccess: (_res, ids) => {
      toast({
        title: `${ids.length} prospects restored.`,
        description: "They are back on the active list in Researching status.",
      });
      stepBackIfPageEmpties(new Set(ids));
      setSelected(new Set());
      setRestoreOpen(false);
      invalidateAfterMutation();
    },
    onError: (err: Error) => {
      setRestoreOpen(false);
      toast({
        title: "Restore failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => prospectsApi.remove(id),
    onSuccess: (_res, id) => {
      toast({
        title: "Prospect deleted",
        description: "The record and its activities were removed permanently.",
      });
      stepBackIfPageEmpties(new Set([id]));
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setDeleteTarget(null);
      invalidateAfterMutation();
    },
    onError: (err: Error) => {
      toast({
        title: "Delete failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const range = useMemo(() => {
    if (!data || total === 0) return { start: 0, end: 0 };
    const start = (data.page - 1) * PAGE_SIZE + 1;
    const end = start + rows.length - 1;
    return { start, end };
  }, [data, total, rows.length]);

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-muted-foreground">
          <span className="font-num font-medium text-foreground">{total}</span>{" "}
          {total === 1 ? "archived record" : "archived records"}
        </p>
        <div className="relative w-full sm:w-64">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or company…"
            aria-label="Search archived records"
            className="h-8 pl-8 pr-8 text-[13px]"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-1.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-[4px] text-muted-foreground transition-colors hover:bg-surface-subtle hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            >
              <X aria-hidden className="size-3.5" />
            </button>
          ) : null}
        </div>
      </div>

      {/* Bulk bar */}
      {selected.size > 0 ? (
        <div
          className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-card px-3 py-2"
          role="status"
        >
          <p className="text-[13px] text-foreground">
            <span className="font-num font-semibold">{selected.size}</span>{" "}
            {selected.size === 1 ? "record" : "records"} selected
          </p>
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              className="h-7 gap-1.5"
              onClick={() => setRestoreOpen(true)}
              disabled={restoreMutation.isPending}
            >
              <ArchiveRestore aria-hidden className="size-3.5" />
              Restore
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-[12.5px] text-muted-foreground"
              onClick={() => setSelected(new Set())}
            >
              Clear
            </Button>
          </div>
        </div>
      ) : null}

      {/* Table / states */}
      {isLoading ? (
        <TableSkeleton rows={8} cols={6} />
      ) : isError ? (
        <ErrorState
          message={error instanceof Error ? error.message : "Could not load the archive."}
          onRetry={() => void refetch()}
        />
      ) : rows.length === 0 ? (
        <div className="rounded-md border bg-card">
          <EmptyState
            title={debouncedQuery ? "No archived records match that search." : "Nothing in the archive."}
            description={
              debouncedQuery
                ? `No archived prospect matches “${debouncedQuery}” by name or company.`
                : "Archived prospects keep their history and can be restored at any time."
            }
          />
        </div>
      ) : (
        <div className="overflow-x-auto scroll-slim rounded-md border bg-card">
          <Table className="text-[13px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-10 px-3">
                  <Checkbox
                    checked={allSelected ? true : someSelected ? "indeterminate" : false}
                    onCheckedChange={toggleAll}
                    aria-label="Select all records on this page"
                  />
                </TableHead>
                <TableHead className="px-2">Name</TableHead>
                <TableHead className="hidden px-2 md:table-cell">Job title</TableHead>
                <TableHead className="hidden px-2 md:table-cell">Company</TableHead>
                <TableHead className="px-2">Status</TableHead>
                <TableHead className="px-2">Archived on</TableHead>
                <TableHead className="hidden px-2 md:table-cell">Last contact</TableHead>
                <TableHead className="px-2">Priority</TableHead>
                <TableHead className="w-10 px-2">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => {
                const name = fullName(p);
                const isSelected = selected.has(p.id);
                return (
                  <TableRow
                    key={p.id}
                    data-state={isSelected ? "selected" : undefined}
                    className="h-10"
                  >
                    <TableCell className="px-3">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleRow(p.id)}
                        aria-label={`Select ${name}`}
                      />
                    </TableCell>
                    <TableCell className="max-w-[16rem] px-2">
                      <button
                        type="button"
                        onClick={() => openProspect(p.id)}
                        className="truncate text-left font-medium text-foreground transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      >
                        {name || "—"}
                      </button>
                    </TableCell>
                    <TableCell className="hidden max-w-[16rem] truncate px-2 text-muted-foreground md:table-cell">
                      {p.jobTitle ?? "—"}
                    </TableCell>
                    <TableCell className="hidden max-w-[14rem] truncate px-2 text-muted-foreground md:table-cell">
                      {p.companyName ?? "—"}
                    </TableCell>
                    <TableCell className="px-2">
                      <StatusBadge status={p.status} />
                    </TableCell>
                    <TableCell className="px-2">
                      <DateLabel date={p.archivedAt} />
                    </TableCell>
                    <TableCell className="hidden px-2 md:table-cell">
                      <DateLabel date={p.lastContactDate} />
                    </TableCell>
                    <TableCell className="px-2">
                      <PriorityBadge priority={p.priority} />
                    </TableCell>
                    <TableCell className="px-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="size-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        aria-label={`Delete ${name} permanently`}
                        onClick={() => setDeleteTarget(p)}
                      >
                        <Trash2 aria-hidden className="size-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pagination footer */}
      {total > 0 ? (
        <div className="flex items-center justify-between gap-2">
          <p className="font-num text-[12.5px] text-muted-foreground">
            Showing {range.start}–{range.end} of {total}
          </p>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1"
              disabled={page <= 1 || isLoading}
              onClick={() => goToPage(Math.max(1, page - 1))}
            >
              <ChevronLeft aria-hidden className="size-3.5" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1"
              disabled={page >= pageCount || isLoading}
              onClick={() => goToPage(page + 1)}
            >
              Next
              <ChevronRight aria-hidden className="size-3.5" />
            </Button>
          </div>
        </div>
      ) : null}

      {/* Bulk restore confirmation */}
      <ConfirmDialog
        open={restoreOpen}
        onOpenChange={(open) => {
          if (!restoreMutation.isPending) setRestoreOpen(open);
        }}
        title={`Restore ${selected.size} ${selected.size === 1 ? "prospect" : "prospects"}?`}
        description="Records return to the active list in Researching status."
        affectedCount={selected.size}
        consequences="A Status Change activity is logged on each record (Archived → Researching). History is kept."
        confirmLabel="Restore"
        onConfirm={() => {
          if (!restoreMutation.isPending && selected.size > 0) {
            restoreMutation.mutate([...selected]);
          }
        }}
      />

      {/* Per-row permanent delete confirmation */}
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !deleteMutation.isPending) setDeleteTarget(null);
        }}
        title={`Delete ${deleteTarget ? fullName(deleteTarget) : ""} permanently?`}
        description="This removes the record from the archive for good."
        consequences="The record and all its activities are deleted. This cannot be undone."
        confirmLabel="Delete permanently"
        destructive
        onConfirm={() => {
          if (deleteTarget && !deleteMutation.isPending) {
            deleteMutation.mutate(deleteTarget.id);
          }
        }}
      />
    </div>
  );
}
