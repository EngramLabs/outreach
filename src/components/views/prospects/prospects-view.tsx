"use client";

// Prospects — the primary scanning surface. One dense toolbar, server-side
// filter/sort/pagination, row selection + auditable bulk ops, saved views,
// CSV export, and the import wizard entry point (spec §11, §13, §23, §29).

import { useEffect, useState } from "react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import {
  campaignsApi,
  companiesApi,
  prospectsApi,
  qk,
  viewsApi,
  type SavedViewItem,
} from "@/lib/api-client";
import type { BulkActionRequest, ProspectsQuery } from "@/lib/types";
import { PRIORITIES, PROSPECT_STATUSES, type ProspectStatus } from "@/lib/constants";
import { useAppStore } from "@/state/app-state";
import { PriorityBadge, StatusBadge, VerificationBadge } from "@/components/shared/status-badge";
import { DateLabel, DueDateLabel } from "@/components/shared/date-label";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowDown,
  ArrowUp,
  BookmarkPlus,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Download,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Static config
// ---------------------------------------------------------------------------

const DEFAULT_FILTERS: ProspectsQuery = {
  status: "all",
  priority: "all",
  sort: "name",
  order: "asc",
  page: 1,
  pageSize: 50,
};

const STATUS_FILTER_GROUPS: { label: string; value: string; statuses: ProspectStatus[] }[] = [
  {
    label: "Research",
    value: "group:research",
    statuses: ["Researching", "Needs Verification"],
  },
  { label: "Ready", value: "group:ready", statuses: ["Verified", "Ready"] },
  {
    label: "In outreach",
    value: "group:active",
    statuses: ["Request Sent", "Connected", "Messaged", "Follow-Up"],
  },
  {
    label: "Responding",
    value: "group:responding",
    statuses: ["Replied", "Meeting", "Converted"],
  },
  {
    label: "Negative",
    value: "group:closed-negative",
    statuses: ["Not Interested", "No Response"],
  },
];

type ColumnKey =
  | "jobTitle"
  | "company"
  | "priority"
  | "fit"
  | "verification"
  | "campaign"
  | "added"
  | "lastContact"
  | "nextFollowUp";

const COLUMNS: { key: ColumnKey; label: string }[] = [
  { key: "jobTitle", label: "Job title" },
  { key: "company", label: "Company" },
  { key: "priority", label: "Priority" },
  { key: "fit", label: "Fit" },
  { key: "verification", label: "Verification" },
  { key: "campaign", label: "Campaign" },
  { key: "added", label: "Added" },
  { key: "lastContact", label: "Last contact" },
  { key: "nextFollowUp", label: "Next follow-up" },
];

// Columns that are hidden below the md breakpoint (true data table scrolls
// horizontally, but non-critical columns drop out first).
const HIDDEN_BELOW_MD = new Set<ColumnKey>(["fit", "campaign", "added", "lastContact"]);

const TH_BASE =
  "h-9 px-3 py-1.5 text-[11.5px] font-semibold uppercase tracking-wide whitespace-nowrap";
const TD_BASE = "px-3 py-1.5 align-middle";

const PRESET_KEYS = [
  "query",
  "status",
  "priority",
  "companyId",
  "campaignId",
  "verification",
  "hasFollowUp",
  "tag",
  "missing",
  "invalid",
  "issue",
  "ids",
  "archived",
  "sort",
  "order",
  "pageSize",
] as const;

/** Keeps only known, primitive ProspectsQuery keys (saved views / presets). */
function sanitizeFilters(raw: Record<string, unknown>): Partial<ProspectsQuery> {
  const out: Record<string, string | number | boolean> = {};
  for (const key of PRESET_KEYS) {
    const v = raw[key];
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      out[key] = v;
    }
  }
  return out as Partial<ProspectsQuery>;
}

function hasActiveFilters(f: ProspectsQuery): boolean {
  return Boolean(
    (f.query && f.query.trim()) ||
      (f.status && f.status !== "all") ||
      (f.priority && f.priority !== "all") ||
      f.companyId ||
      f.campaignId ||
      f.verification ||
      f.hasFollowUp ||
      f.tag ||
      f.missing ||
      f.invalid ||
      f.issue ||
      f.ids ||
      f.archived,
  );
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function pageWindow(current: number, pageCount: number): (number | "gap")[] {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, i) => i + 1);
  }
  const wanted = [1, 2, current - 1, current, current + 1, pageCount - 1, pageCount]
    .filter((p) => p >= 1 && p <= pageCount);
  const pages = [...new Set(wanted)].sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  let prev = 0;
  for (const p of pages) {
    if (p - prev > 1) out.push("gap");
    out.push(p);
    prev = p;
  }
  return out;
}

function describeBulk(
  action: BulkActionRequest,
  affected: number,
): { title: string; description: string } {
  switch (action.action) {
    case "status":
      return {
        title: `Status set to ${action.value}`,
        description: `${plural(affected, "prospect")} updated. A Status Change activity was recorded for each; missing lifecycle dates were filled.`,
      };
    case "priority":
      return {
        title: `Priority set to ${action.value}`,
        description: `${plural(affected, "prospect")} updated.`,
      };
    case "campaign":
      return {
        title: action.value ? "Campaign assigned" : "Removed from campaign",
        description: `${plural(affected, "prospect")} updated.`,
      };
    case "archive":
      return {
        title: "Prospects archived",
        description: `${plural(affected, "record")} moved to the Archive. Restore them from the Archive view.`,
      };
    case "restore":
      return {
        title: "Prospects restored",
        description: `${plural(affected, "record")} returned to the active list.`,
      };
    case "delete":
      return {
        title: "Prospects deleted",
        description: `${plural(affected, "record")} and their activities were permanently deleted.`,
      };
    case "verification":
      return {
        title: `Verification set to ${action.value}`,
        description: `${plural(affected, "prospect")} updated.`,
      };
  }
}

type BulkConfirm =
  | { kind: "status"; value: string }
  | { kind: "archive" }
  | { kind: "delete" }
  | null;

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

export function ProspectsView() {
  const queryClient = useQueryClient();
  const preset = useAppStore((s) => s.prospectPreset);
  const setView = useAppStore((s) => s.setView);
  const openProspect = useAppStore((s) => s.openProspect);
  const openProspectForm = useAppStore((s) => s.openProspectForm);
  const setImportOpen = useAppStore((s) => s.setImportOpen);

  // Presets from other views (Data Quality fixes, campaign drilldowns) are
  // consumed at mount — every navigation swaps the view component, so the
  // initializer always sees a fresh preset. The effect clears it in the store.
  const [filters, setFilters] = useState<ProspectsQuery>(() => {
    const clean = preset ? sanitizeFilters(preset) : {};
    return { ...DEFAULT_FILTERS, ...clean, page: 1 };
  });
  const [searchInput, setSearchInput] = useState(() =>
    preset && typeof preset.query === "string" ? preset.query : "",
  );
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set<string>());
  const [columns, setColumns] = useState<Record<ColumnKey, boolean>>(() =>
    Object.fromEntries(COLUMNS.map((c) => [c.key, true])) as Record<ColumnKey, boolean>,
  );

  // Bulk action bar state
  const [bulkStatus, setBulkStatus] = useState("");
  const [bulkPriority, setBulkPriority] = useState("");
  const [bulkCampaign, setBulkCampaign] = useState("");
  const [confirmBulk, setConfirmBulk] = useState<BulkConfirm>(null);

  // Saved views state
  const [saveViewOpen, setSaveViewOpen] = useState(false);
  const [saveViewName, setSaveViewName] = useState("");
  const [confirmDeleteView, setConfirmDeleteView] = useState<SavedViewItem | null>(null);

  // --- Clear the consumed preset (external store update, once per preset) ---
  useEffect(() => {
    if (preset) setView("prospects"); // setView also resets prospectPreset to null
  }, [preset, setView]);

  // --- Debounced search (350ms, matches the server `query` param) ---
  useEffect(() => {
    const t = window.setTimeout(() => {
      const q = searchInput.trim() || undefined;
      setFilters((f) => (f.query === q ? f : { ...f, query: q, page: 1 }));
    }, 350);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  // --- Data ---
  const listQuery = useQuery({
    queryKey: qk.prospects(filters),
    queryFn: () => prospectsApi.list(filters),
    placeholderData: keepPreviousData,
  });

  const { data: companiesRes } = useQuery({
    queryKey: qk.companies(),
    queryFn: () => companiesApi.list(),
  });
  const { data: campaignsRes } = useQuery({
    queryKey: qk.campaigns({ status: "all" }),
    queryFn: () => campaignsApi.list({ status: "all" }),
  });
  const viewsQuery = useQuery({ queryKey: qk.views, queryFn: viewsApi.list });

  const rows = listQuery.data?.data ?? [];
  const total = listQuery.data?.total ?? 0;
  const pageCount = listQuery.data?.pageCount ?? 1;
  const currentPage = listQuery.data?.page ?? 1;
  const pageSize = filters.pageSize ?? 50;
  // A page can sit past the end of the results after data shrinks.
  const pastEnd = rows.length === 0 && total > 0;

  const companies = companiesRes?.data ?? [];
  const campaigns = campaignsRes?.data ?? [];
  const savedViews = viewsQuery.data?.data ?? [];

  // --- Filter helpers ---
  const setFilter = <K extends keyof ProspectsQuery>(key: K, value: ProspectsQuery[K]) =>
    setFilters((f) => ({ ...f, [key]: value, page: 1 }));

  function clearFilters() {
    setFilters(DEFAULT_FILTERS);
    setSearchInput("");
    setSelected(new Set());
  }

  function toggleSort(sortKey: string) {
    setFilters((f) => {
      if (f.sort === sortKey) {
        return { ...f, order: f.order === "asc" ? "desc" : "asc" };
      }
      const descending = sortKey === "dateAdded" || sortKey === "lastContact" || sortKey === "nextFollowUp";
      return { ...f, sort: sortKey, order: descending ? "desc" : "asc", page: 1 };
    });
  }

  function colClass(key: ColumnKey): string {
    if (!columns[key]) return "hidden";
    return HIDDEN_BELOW_MD.has(key) ? "hidden md:table-cell" : "";
  }

  function exportableFilters(): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(filters)) {
      if (k === "page") continue;
      if (v === undefined || v === null || v === "" || v === "all") continue;
      out[k] = v;
    }
    return out;
  }

  function doExport(scope: "current" | "all") {
    const sp = new URLSearchParams({ type: "prospects" });
    if (scope === "all") {
      sp.set("scope", "all");
    } else {
      for (const [k, v] of Object.entries(exportableFilters())) sp.set(k, String(v));
    }
    window.location.href = `/api/export?${sp.toString()}`;
  }

  function loadSavedView(view: SavedViewItem) {
    const clean = sanitizeFilters(view.filters);
    setFilters({ ...DEFAULT_FILTERS, ...clean, page: 1 });
    setSearchInput(typeof clean.query === "string" ? clean.query : "");
    setSelected(new Set());
  }

  // --- Selection ---
  const pageIds = rows.map((r) => r.id);
  const allOnPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const someOnPageSelected = pageIds.some((id) => selected.has(id));

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllOnPage() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  }

  // --- Bulk mutation ---
  const bulkMutation = useMutation({
    mutationFn: (payload: BulkActionRequest) => prospectsApi.bulk(payload),
    onSuccess: (result, vars) => {
      void queryClient.invalidateQueries({ queryKey: ["prospects"] });
      void queryClient.invalidateQueries({ queryKey: ["prospect"] });
      void queryClient.invalidateQueries({ queryKey: qk.dashboard });
      void queryClient.invalidateQueries({ queryKey: ["followups"] });
      if (vars.action === "campaign") {
        void queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      }
      const affected = Number(
        result.updated ?? result.archived ?? result.deleted ?? result.restored ?? result.matched ?? 0,
      );
      const described = describeBulk(vars, affected);
      toast({ title: described.title, description: described.description });
      setSelected(new Set());
      setConfirmBulk(null);
      setBulkStatus("");
      setBulkPriority("");
      setBulkCampaign("");
      // Deleted/archived rows can shorten the result — land back on page 1.
      setFilters((f) => ({ ...f, page: 1 }));
    },
    onError: (err) => {
      toast({
        title: "Bulk change failed",
        description: err instanceof Error ? err.message : "Nothing was changed. Try again.",
        variant: "destructive",
      });
    },
  });

  function runBulk(action: BulkActionRequest["action"], value?: string) {
    if (selected.size === 0) return;
    bulkMutation.mutate({ ids: [...selected], action, value });
  }

  // --- Saved view mutations ---
  const saveViewMutation = useMutation({
    mutationFn: () => viewsApi.save(saveViewName.trim(), exportableFilters()),
    onSuccess: (res) => {
      toast({
        title: res.updated ? "View updated" : "View saved",
        description: `“${res.name}” now holds the current filters.`,
      });
      setSaveViewOpen(false);
      setSaveViewName("");
      void queryClient.invalidateQueries({ queryKey: qk.views });
    },
    onError: (err) => {
      toast({
        title: "Could not save the view",
        description: err instanceof Error ? err.message : "Try again.",
        variant: "destructive",
      });
    },
  });

  const deleteViewMutation = useMutation({
    mutationFn: (id: string) => viewsApi.remove(id),
    onSuccess: () => {
      toast({ title: "Saved view deleted" });
      setConfirmDeleteView(null);
      void queryClient.invalidateQueries({ queryKey: qk.views });
    },
    onError: (err) => {
      toast({
        title: "Could not delete the view",
        description: err instanceof Error ? err.message : "Try again.",
        variant: "destructive",
      });
    },
  });

  // --- Extra (preset) filters shown as removable chips ---
  const extraChips: { key: keyof ProspectsQuery; label: string }[] = [];
  if (filters.issue) extraChips.push({ key: "issue", label: `Issue: ${filters.issue}` });
  if (filters.missing) extraChips.push({ key: "missing", label: `Missing: ${filters.missing}` });
  if (filters.invalid) extraChips.push({ key: "invalid", label: `Invalid: ${filters.invalid}` });
  if (filters.tag) extraChips.push({ key: "tag", label: `Tag: ${filters.tag}` });
  if (filters.ids) extraChips.push({ key: "ids", label: "Specific records" });
  if (filters.archived) extraChips.push({ key: "archived", label: "Archive scope" });

  const knownStatusValues = new Set<string>([
    "all",
    ...STATUS_FILTER_GROUPS.map((g) => g.value),
    ...PROSPECT_STATUSES,
  ]);
  const customStatusItem =
    filters.status && !knownStatusValues.has(filters.status) ? filters.status : null;

  const datasetEmpty = total === 0 && !hasActiveFilters(filters);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search name, title, email, company…"
            aria-label="Search prospects"
            className="h-8 w-52 pl-8 text-[13px]"
          />
        </div>

        <Select
          value={filters.status ?? "all"}
          onValueChange={(v) => setFilter("status", v)}
        >
          <SelectTrigger size="sm" className="h-8 w-[150px] text-[13px]" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUS_FILTER_GROUPS.map((g) => (
              <SelectGroup key={g.value}>
                <SelectLabel className="text-[11px]">{g.label}</SelectLabel>
                <SelectItem value={g.value}>All {g.label.toLowerCase()}</SelectItem>
                {g.statuses.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
            <SelectGroup>
              <SelectLabel className="text-[11px]">Archived</SelectLabel>
              <SelectItem value="Archived">Archived</SelectItem>
            </SelectGroup>
            {customStatusItem ? (
              <SelectItem value={customStatusItem}>Custom status filter</SelectItem>
            ) : null}
          </SelectContent>
        </Select>

        <Select value={filters.priority ?? "all"} onValueChange={(v) => setFilter("priority", v)}>
          <SelectTrigger size="sm" className="h-8 w-[118px] text-[13px]" aria-label="Filter by priority">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All priorities</SelectItem>
            {PRIORITIES.map((p) => (
              <SelectItem key={p} value={p}>
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.campaignId ?? "all"}
          onValueChange={(v) => setFilter("campaignId", v === "all" ? undefined : v)}
        >
          <SelectTrigger size="sm" className="h-8 w-[150px] text-[13px]" aria-label="Filter by campaign">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All campaigns</SelectItem>
            <SelectItem value="none">No campaign</SelectItem>
            {campaigns.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                <span className="max-w-[14rem] truncate">{c.name}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.companyId ?? "all"}
          onValueChange={(v) => setFilter("companyId", v === "all" ? undefined : v)}
        >
          <SelectTrigger size="sm" className="h-8 w-[150px] text-[13px]" aria-label="Filter by company">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All companies</SelectItem>
            <SelectItem value="none">No company</SelectItem>
            {companies.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                <span className="max-w-[14rem] truncate">{c.name}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.verification ?? "all"}
          onValueChange={(v) => setFilter("verification", v === "all" ? undefined : v)}
        >
          <SelectTrigger size="sm" className="h-8 w-[126px] text-[13px]" aria-label="Filter by verification">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any verification</SelectItem>
            <SelectItem value="none">Unverified</SelectItem>
            <SelectItem value="Partial">Partial</SelectItem>
            <SelectItem value="Verified">Verified</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={filters.hasFollowUp ?? "all"}
          onValueChange={(v) => setFilter("hasFollowUp", v === "all" ? undefined : (v as ProspectsQuery["hasFollowUp"]))}
        >
          <SelectTrigger size="sm" className="h-8 w-[138px] text-[13px]" aria-label="Filter by follow-up">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any follow-up</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
            <SelectItem value="today">Due today</SelectItem>
            <SelectItem value="week">This week</SelectItem>
            <SelectItem value="none">No follow-up</SelectItem>
          </SelectContent>
        </Select>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {/* Saved views dropdown + save popover */}
          <Popover open={saveViewOpen} onOpenChange={setSaveViewOpen}>
            <PopoverAnchor asChild>
              <span className="inline-flex">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 text-[13px]">
                      Views
                      <ChevronDown aria-hidden className="size-3.5 text-muted-foreground" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-60">
                    <DropdownMenuLabel className="text-[12px]">Saved views</DropdownMenuLabel>
                    {viewsQuery.isPending ? (
                      <p className="px-2 py-1.5 text-[12px] text-muted-foreground">Loading…</p>
                    ) : savedViews.length === 0 ? (
                      <p className="px-2 py-1.5 text-[12px] text-muted-foreground">
                        No saved views yet.
                      </p>
                    ) : (
                      savedViews.map((v) => (
                        <div key={v.id} className="flex items-center">
                          <DropdownMenuItem className="min-w-0 flex-1" onSelect={() => loadSavedView(v)}>
                            <span className="truncate">{v.name}</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant="destructive"
                            className="w-8 shrink-0 justify-center px-0"
                            aria-label={`Delete saved view “${v.name}”`}
                            onSelect={() => setConfirmDeleteView(v)}
                          >
                            <Trash2 aria-hidden className="size-3.5" />
                          </DropdownMenuItem>
                        </div>
                      ))
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => setSaveViewOpen(true)}>
                      <BookmarkPlus aria-hidden className="size-3.5" />
                      Save current view…
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </span>
            </PopoverAnchor>
            <PopoverContent
              align="end"
              className="w-64 p-3"
              // The dropdown returns focus to its trigger as it closes; that
              // focus event must not dismiss the just-opened popover.
              onFocusOutside={(e) => e.preventDefault()}
            >
              <p className="text-[13px] font-medium text-foreground">Save current view</p>
              <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
                Stores the active filters. Saving under an existing name replaces it.
              </p>
              <form
                className="mt-2 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (saveViewName.trim() && !saveViewMutation.isPending) saveViewMutation.mutate();
                }}
              >
                <Input
                  autoFocus
                  value={saveViewName}
                  onChange={(e) => setSaveViewName(e.target.value)}
                  placeholder="View name"
                  aria-label="Saved view name"
                  maxLength={100}
                  className="h-8 text-[13px]"
                />
                <Button type="submit" size="sm" className="h-8" disabled={!saveViewName.trim() || saveViewMutation.isPending}>
                  {saveViewMutation.isPending ? "Saving…" : "Save"}
                </Button>
              </form>
            </PopoverContent>
          </Popover>

          {/* Column visibility */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 text-[13px]" aria-label="Toggle table columns">
                <Columns3 aria-hidden className="size-3.5" />
                <span className="hidden sm:inline">Columns</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel className="text-[12px]">Visible columns</DropdownMenuLabel>
              {COLUMNS.map((c) => (
                <DropdownMenuCheckboxItem
                  key={c.key}
                  checked={columns[c.key]}
                  onCheckedChange={(checked) =>
                    setColumns((prev) => ({ ...prev, [c.key]: checked === true }))
                  }
                  onSelect={(e) => e.preventDefault()}
                  className="text-[13px]"
                >
                  {c.label}
                </DropdownMenuCheckboxItem>
              ))}
              <DropdownMenuSeparator />
              <p className="px-2 py-1 text-[11px] leading-relaxed text-muted-foreground">
                Name and status are always shown.
              </p>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Export */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 text-[13px]">
                <Download aria-hidden className="size-3.5" />
                Export
                <ChevronDown aria-hidden className="size-3.5 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onSelect={() => doExport("current")}>
                Export current view (CSV)
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => doExport("all")}>
                Export all prospects
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button variant="outline" size="sm" className="h-8 text-[13px]" onClick={() => setImportOpen(true)}>
            <Upload aria-hidden className="size-3.5" />
            Import
          </Button>

          <Button size="sm" className="h-8 text-[13px]" onClick={() => openProspectForm(null)}>
            <Plus aria-hidden className="size-3.5" />
            Add prospect
          </Button>
        </div>
      </div>

      {/* Extra preset filters (Data Quality drilldowns etc.) */}
      {extraChips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {extraChips.map((chip) => (
            <span
              key={chip.key}
              className="inline-flex items-center gap-1 rounded-sm border bg-surface-subtle px-2 py-1 text-[12px] text-muted-foreground"
            >
              {chip.label}
              <button
                type="button"
                onClick={() => setFilters((f) => ({ ...f, [chip.key]: undefined }))}
                aria-label={`Clear filter “${chip.label}”`}
                className="rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
              >
                <X aria-hidden className="size-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      {/* Bulk action bar */}
      {selected.size > 0 ? (
        <div
          role="toolbar"
          aria-label="Bulk actions for selected prospects"
          className="sticky top-12 z-20 flex flex-wrap items-center gap-2 rounded-md border bg-card px-3 py-2"
        >
          <p className="font-num text-[12.5px] font-medium text-foreground">
            {selected.size} selected
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="flex items-center gap-1">
              <Select value={bulkStatus} onValueChange={setBulkStatus}>
                <SelectTrigger
                  size="sm"
                  className="h-7 w-[150px] text-[12.5px]"
                  aria-label="Set status for selected prospects"
                >
                  <SelectValue placeholder="Set status" />
                </SelectTrigger>
                <SelectContent>
                  {PROSPECT_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-[12.5px]"
                disabled={!bulkStatus || bulkMutation.isPending}
                onClick={() => bulkStatus && setConfirmBulk({ kind: "status", value: bulkStatus })}
              >
                Apply
              </Button>
            </div>

            <div className="flex items-center gap-1">
              <Select value={bulkPriority} onValueChange={setBulkPriority}>
                <SelectTrigger
                  size="sm"
                  className="h-7 w-[118px] text-[12.5px]"
                  aria-label="Set priority for selected prospects"
                >
                  <SelectValue placeholder="Set priority" />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-[12.5px]"
                disabled={!bulkPriority || bulkMutation.isPending}
                onClick={() => bulkPriority && runBulk("priority", bulkPriority)}
              >
                Apply
              </Button>
            </div>

            <div className="flex items-center gap-1">
              <Select value={bulkCampaign} onValueChange={setBulkCampaign}>
                <SelectTrigger
                  size="sm"
                  className="h-7 w-[150px] text-[12.5px]"
                  aria-label="Set campaign for selected prospects"
                >
                  <SelectValue placeholder="Set campaign" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Remove from campaign</SelectItem>
                  {campaigns.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="max-w-[14rem] truncate">{c.name}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-[12.5px]"
                disabled={!bulkCampaign || bulkMutation.isPending}
                onClick={() =>
                  bulkCampaign &&
                  runBulk("campaign", bulkCampaign === "__none__" ? "" : bulkCampaign)
                }
              >
                Apply
              </Button>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-[12.5px]"
              disabled={bulkMutation.isPending}
              onClick={() => setConfirmBulk({ kind: "archive" })}
            >
              Archive
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="h-7 text-[12.5px]"
              disabled={bulkMutation.isPending}
              onClick={() => setConfirmBulk({ kind: "delete" })}
            >
              Delete
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-1.5"
              onClick={() => setSelected(new Set())}
              aria-label="Clear selection"
            >
              <X aria-hidden className="size-3.5" />
            </Button>
          </div>
        </div>
      ) : null}

      {/* Table / states */}
      {listQuery.isPending ? (
        <TableSkeleton rows={10} cols={8} />
      ) : listQuery.isError ? (
        <ErrorState
          message={
            listQuery.error instanceof Error
              ? listQuery.error.message
              : "Could not load prospects."
          }
          onRetry={() => void listQuery.refetch()}
        />
      ) : rows.length === 0 ? (
        pastEnd ? (
          <EmptyState
            title="This page is past the end of the results"
            description="The filtered result got shorter — earlier pages still have records."
            action={{
              label: "Back to page 1",
              onClick: () => setFilters((f) => ({ ...f, page: 1 })),
            }}
          />
        ) : (
          <EmptyState
            title={datasetEmpty ? "No prospects yet" : "No prospects match these filters"}
            description={
              datasetEmpty
                ? "Add your first prospect, or import a CSV list (LinkedIn exports work)."
                : "Try clearing a filter or widening the status selection."
            }
            action={
              datasetEmpty
                ? { label: "Add prospect", onClick: () => openProspectForm(null) }
                : { label: "Clear filters", onClick: clearFilters }
            }
          />
        )
      ) : (
        <div className="overflow-x-auto scroll-slim rounded-md border bg-card">
          <Table className="text-[13px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={cn(TH_BASE, "w-10")}>
                  <Checkbox
                    checked={
                      allOnPageSelected ? true : someOnPageSelected ? "indeterminate" : false
                    }
                    onCheckedChange={toggleSelectAllOnPage}
                    aria-label="Select all prospects on this page"
                  />
                </TableHead>
                <SortableTh
                  label="Name"
                  sortKey="name"
                  active={filters.sort === "name"}
                  order={filters.order}
                  onSort={toggleSort}
                />
                {columns.jobTitle ? (
                  <TableHead className={cn(TH_BASE, colClass("jobTitle"))}>Job title</TableHead>
                ) : null}
                {columns.company ? (
                  <SortableTh
                    label="Company"
                    sortKey="company"
                    active={filters.sort === "company"}
                    order={filters.order}
                    onSort={toggleSort}
                    className={colClass("company")}
                  />
                ) : null}
                <TableHead className={TH_BASE} aria-sort={sortAria(filters.sort === "status", filters.order)}>
                  <SortButton
                    label="Status"
                    sortKey="status"
                    active={filters.sort === "status"}
                    order={filters.order}
                    onSort={toggleSort}
                  />
                </TableHead>
                {columns.priority ? (
                  <TableHead className={cn(TH_BASE, colClass("priority"))} aria-sort={sortAria(filters.sort === "priority", filters.order)}>
                    <SortButton
                      label="Priority"
                      sortKey="priority"
                      active={filters.sort === "priority"}
                      order={filters.order}
                      onSort={toggleSort}
                    />
                  </TableHead>
                ) : null}
                {columns.fit ? (
                  <TableHead className={cn(TH_BASE, "text-right", colClass("fit"))} aria-sort={sortAria(filters.sort === "fitScore", filters.order)}>
                    <SortButton
                      label="Fit"
                      sortKey="fitScore"
                      active={filters.sort === "fitScore"}
                      order={filters.order}
                      onSort={toggleSort}
                    />
                  </TableHead>
                ) : null}
                {columns.verification ? (
                  <TableHead className={cn(TH_BASE, colClass("verification"))}>Verification</TableHead>
                ) : null}
                {columns.campaign ? (
                  <TableHead className={cn(TH_BASE, colClass("campaign"))} aria-sort={sortAria(filters.sort === "campaign", filters.order)}>
                    <SortButton
                      label="Campaign"
                      sortKey="campaign"
                      active={filters.sort === "campaign"}
                      order={filters.order}
                      onSort={toggleSort}
                    />
                  </TableHead>
                ) : null}
                {columns.added ? (
                  <TableHead className={cn(TH_BASE, colClass("added"))} aria-sort={sortAria(filters.sort === "dateAdded", filters.order)}>
                    <SortButton
                      label="Added"
                      sortKey="dateAdded"
                      active={filters.sort === "dateAdded"}
                      order={filters.order}
                      onSort={toggleSort}
                    />
                  </TableHead>
                ) : null}
                {columns.lastContact ? (
                  <TableHead className={cn(TH_BASE, colClass("lastContact"))} aria-sort={sortAria(filters.sort === "lastContact", filters.order)}>
                    <SortButton
                      label="Last contact"
                      sortKey="lastContact"
                      active={filters.sort === "lastContact"}
                      order={filters.order}
                      onSort={toggleSort}
                    />
                  </TableHead>
                ) : null}
                {columns.nextFollowUp ? (
                  <TableHead className={cn(TH_BASE, colClass("nextFollowUp"))} aria-sort={sortAria(filters.sort === "nextFollowUp", filters.order)}>
                    <SortButton
                      label="Next follow-up"
                      sortKey="nextFollowUp"
                      active={filters.sort === "nextFollowUp"}
                      order={filters.order}
                      onSort={toggleSort}
                    />
                  </TableHead>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => (
                <TableRow
                  key={p.id}
                  onClick={() => openProspect(p.id)}
                  className={cn(
                    "h-10 cursor-pointer",
                    selected.has(p.id) && "bg-surface-subtle",
                  )}
                >
                  <TableCell className={TD_BASE} onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selected.has(p.id)}
                      onCheckedChange={() => toggleRow(p.id)}
                      aria-label={`Select ${p.firstName} ${p.lastName ?? ""}`}
                    />
                  </TableCell>
                  <TableCell className={TD_BASE}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openProspect(p.id);
                      }}
                      className="block max-w-[16rem] truncate text-left font-medium text-foreground transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      title={`${p.firstName} ${p.lastName ?? ""}`}
                    >
                      {p.firstName}
                      {p.lastName ? ` ${p.lastName}` : ""}
                    </button>
                  </TableCell>
                  {columns.jobTitle ? (
                    <TableCell className={cn(TD_BASE, colClass("jobTitle"))}>
                      {p.jobTitle ? (
                        <span className="block max-w-[16rem] truncate" title={p.jobTitle}>
                          {p.jobTitle}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/50">—</span>
                      )}
                    </TableCell>
                  ) : null}
                  {columns.company ? (
                    <TableCell className={cn(TD_BASE, colClass("company"))}>
                      {p.companyName ? (
                        <span className="block max-w-[12rem] truncate text-muted-foreground" title={p.companyName}>
                          {p.companyName}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/50">—</span>
                      )}
                    </TableCell>
                  ) : null}
                  <TableCell className={TD_BASE}>
                    <StatusBadge status={p.status} />
                  </TableCell>
                  {columns.priority ? (
                    <TableCell className={cn(TD_BASE, colClass("priority"))}>
                      <PriorityBadge priority={p.priority} />
                    </TableCell>
                  ) : null}
                  {columns.fit ? (
                    <TableCell className={cn(TD_BASE, "text-right", colClass("fit"))}>
                      <span className={cn("font-num", p.fitScore == null && "text-muted-foreground/50")}>
                        {p.fitScore ?? "—"}
                      </span>
                    </TableCell>
                  ) : null}
                  {columns.verification ? (
                    <TableCell className={cn(TD_BASE, colClass("verification"))}>
                      <VerificationBadge status={p.verificationStatus} />
                    </TableCell>
                  ) : null}
                  {columns.campaign ? (
                    <TableCell className={cn(TD_BASE, colClass("campaign"))}>
                      {p.campaignName ? (
                        <span className="block max-w-[10rem] truncate text-muted-foreground" title={p.campaignName}>
                          {p.campaignName}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/50">—</span>
                      )}
                    </TableCell>
                  ) : null}
                  {columns.added ? (
                    <TableCell className={cn(TD_BASE, colClass("added"))}>
                      <DateLabel date={p.dateAdded} />
                    </TableCell>
                  ) : null}
                  {columns.lastContact ? (
                    <TableCell className={cn(TD_BASE, colClass("lastContact"))}>
                      <DateLabel date={p.lastContactDate} />
                    </TableCell>
                  ) : null}
                  {columns.nextFollowUp ? (
                    <TableCell className={cn(TD_BASE, colClass("nextFollowUp"))}>
                      <DueDateLabel date={p.nextFollowUpDate} />
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pagination footer */}
      {!listQuery.isPending && !listQuery.isError && total > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-num text-[12px] text-muted-foreground">
            Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, total)} of{" "}
            {total}
            {listQuery.isFetching ? <span aria-live="polite"> · updating…</span> : null}
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2"
              disabled={currentPage <= 1}
              onClick={() => setFilters((f) => ({ ...f, page: Math.max(1, (f.page ?? 1) - 1) }))}
              aria-label="Previous page"
            >
              <ChevronLeft aria-hidden className="size-3.5" />
            </Button>
            {pageWindow(currentPage, pageCount).map((p, i) =>
              p === "gap" ? (
                <span key={`gap-${i}`} className="px-1 font-num text-[12px] text-muted-foreground">
                  …
                </span>
              ) : (
                <Button
                  key={p}
                  variant={p === currentPage ? "default" : "outline"}
                  size="sm"
                  className="h-7 min-w-7 px-2 font-num text-[12px]"
                  onClick={() => setFilters((f) => ({ ...f, page: p }))}
                  aria-label={`Go to page ${p}`}
                  aria-current={p === currentPage ? "page" : undefined}
                >
                  {p}
                </Button>
              ),
            )}
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2"
              disabled={currentPage >= pageCount}
              onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) + 1 }))}
              aria-label="Next page"
            >
              <ChevronRight aria-hidden className="size-3.5" />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="prospects-page-size" className="text-[12px] text-muted-foreground">
              Rows per page
            </label>
            <Select
              value={String(pageSize)}
              onValueChange={(v) => setFilters((f) => ({ ...f, pageSize: Number(v), page: 1 }))}
            >
              <SelectTrigger size="sm" className="h-7 w-[72px] font-num text-[12.5px]" id="prospects-page-size">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[25, 50, 100].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    <span className="font-num">{n}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      ) : null}

      {/* Confirmations */}
      <ConfirmDialog
        open={confirmBulk?.kind === "status"}
        onOpenChange={(open) => {
          if (!open) setConfirmBulk(null);
        }}
        title="Change status"
        description={`Set the status of the selected prospects to “${confirmBulk?.kind === "status" ? confirmBulk.value : ""}”?`}
        affectedCount={selected.size}
        consequences="Each record gets an auditable Status Change activity. Missing lifecycle dates (request sent, connected, first message…) are filled automatically, and the follow-up queue updates."
        confirmLabel={`Set status for ${selected.size}`}
        onConfirm={() => {
          if (confirmBulk?.kind === "status") runBulk("status", confirmBulk.value);
        }}
      />
      <ConfirmDialog
        open={confirmBulk?.kind === "archive"}
        onOpenChange={(open) => {
          if (!open) setConfirmBulk(null);
        }}
        title="Archive prospects"
        description="Archive the selected prospects?"
        affectedCount={selected.size}
        consequences="Records move to Archive; statuses set to Archived; restorable from the Archive view."
        confirmLabel={`Archive ${selected.size}`}
        onConfirm={() => runBulk("archive")}
      />
      <ConfirmDialog
        open={confirmBulk?.kind === "delete"}
        onOpenChange={(open) => {
          if (!open) setConfirmBulk(null);
        }}
        title="Delete prospects"
        description={`Permanently delete ${plural(selected.size, "prospect")}?`}
        affectedCount={selected.size}
        consequences="Activities are deleted with the prospect. This cannot be undone."
        confirmLabel={`Delete ${selected.size}`}
        destructive
        onConfirm={() => runBulk("delete")}
      />
      <ConfirmDialog
        open={confirmDeleteView !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmDeleteView(null);
        }}
        title="Delete saved view"
        description={`Delete the saved view “${confirmDeleteView?.name ?? ""}”?`}
        consequences="The saved filter set is removed. Your prospects are not affected."
        confirmLabel="Delete view"
        destructive
        onConfirm={() => {
          if (confirmDeleteView) deleteViewMutation.mutate(confirmDeleteView.id);
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small local helpers
// ---------------------------------------------------------------------------

function sortAria(
  active: boolean,
  order: "asc" | "desc" | undefined,
): "ascending" | "descending" | "none" {
  return active ? (order === "desc" ? "descending" : "ascending") : "none";
}

function SortButton({
  label,
  sortKey,
  active,
  order,
  onSort,
}: {
  label: string;
  sortKey: string;
  active: boolean;
  order: "asc" | "desc" | undefined;
  onSort: (key: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className="inline-flex items-center gap-1 rounded-sm uppercase transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      {label}
      {active ? (
        order === "asc" ? (
          <ArrowUp aria-hidden className="size-3" />
        ) : (
          <ArrowDown aria-hidden className="size-3" />
        )
      ) : null}
    </button>
  );
}

function SortableTh({
  label,
  sortKey,
  active,
  order,
  onSort,
  className,
}: {
  label: string;
  sortKey: string;
  active: boolean;
  order: "asc" | "desc" | undefined;
  onSort: (key: string) => void;
  className?: string;
}) {
  return (
    <TableHead
      className={cn(TH_BASE, className)}
      aria-sort={sortAria(active, order)}
    >
      <SortButton label={label} sortKey={sortKey} active={active} order={order} onSort={onSort} />
    </TableHead>
  );
}
