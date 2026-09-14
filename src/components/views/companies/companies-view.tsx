"use client";

// Companies view (spec §13): compact table + detail sheet. Companies are
// separate entities — one company holds many prospects, and the prospect
// count links cross-view into the filtered prospects table. Duplicate
// companies are surfaced by the Data Quality view; here we list and manage.
// All numbers come from the API — no local mock data.

import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Linkedin, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DateLabel, DueDateLabel, formatDate } from "@/components/shared/date-label";
import { ActivityTypeBadge, StatusBadge } from "@/components/shared/status-badge";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/shared/states";
import { companiesApi, qk } from "@/lib/api-client";
import type { CompanyRow } from "@/lib/types";
import { useAppStore } from "@/state/app-state";
import { toast } from "@/hooks/use-toast";

// GET /api/companies/:id response (subset this view renders).
type CompanyDetailProspect = {
  id: string;
  firstName: string;
  lastName: string | null;
  jobTitle: string | null;
  status: string;
  priority: string;
  campaignId: string | null;
  campaignName: string | null;
  lastContactDate: string | null;
  nextFollowUpDate: string | null;
};

type CompanyDetailActivity = {
  id: string;
  activityType: string;
  occurredAt: string;
  prospectName: string | null;
  notes: string | null;
};

type CompanyDetail = {
  id: string;
  name: string;
  website: string | null;
  linkedinUrl: string | null;
  industry: string | null;
  location: string | null;
  companySize: string | null;
  source: string | null;
  status: string;
  notes: string | null;
  tags: string | null;
  createdAt: string;
  updatedAt: string;
  prospectCount: number;
  prospects: CompanyDetailProspect[];
  recentActivities: CompanyDetailActivity[];
  campaigns: { id: string; name: string; status: string }[];
};

type StatusFilter = "active" | "archived" | "all";
type SortKey = "name" | "prospects" | "newest";

const fullName = (p: { firstName: string; lastName: string | null }): string =>
  p.lastName ? `${p.firstName} ${p.lastName}` : p.firstName;

const TH = "h-8 px-3 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground";

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </h3>
  );
}

export function CompaniesView() {
  const setView = useAppStore((s) => s.setView);
  const openCompanyForm = useAppStore((s) => s.openCompanyForm);
  const openProspect = useAppStore((s) => s.openProspect);
  const queryClient = useQueryClient();

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Debounced search (name / industry / location — the API also matches website).
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 250);
    return () => clearTimeout(t);
  }, [searchInput]);

  const listParams = {
    query: search || undefined,
    status: statusFilter === "active" ? "Active" : statusFilter === "archived" ? "Archived" : "all",
    sort: sortKey === "prospects" ? "prospects" : sortKey === "newest" ? "createdAt" : "name",
    order: sortKey === "name" ? "asc" : "desc",
  };

  const list = useQuery({
    queryKey: qk.companies(listParams),
    queryFn: () => companiesApi.list(listParams),
  });

  const detail = useQuery({
    queryKey: qk.company(selectedId ?? ""),
    queryFn: () => companiesApi.get(selectedId!) as Promise<CompanyDetail>,
    enabled: selectedId !== null,
  });
  const company = detail.data;

  const removeCompany = useMutation({
    mutationFn: (id: string) => companiesApi.remove(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["companies"] });
      await queryClient.invalidateQueries({ queryKey: ["company"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast({ title: "Company deleted", description: "The company and its notes were removed." });
      setConfirmDelete(false);
      setSelectedId(null);
    },
    onError: (err: Error) => {
      setConfirmDelete(false);
      toast({
        title: "Could not delete the company",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const rows: CompanyRow[] = list.data?.data ?? [];
  const hasFilters = search !== "" || statusFilter !== "active";

  const gotoProspects = (companyId: string) => {
    setSelectedId(null);
    setView("prospects", { companyId });
  };

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-full sm:w-64">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search name, industry, location…"
          aria-label="Search companies"
          className="h-9 pl-8 text-[13px]"
        />
      </div>
      <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
        <SelectTrigger className="h-9 w-[118px] text-[13px]" aria-label="Filter companies by status">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="active">Active</SelectItem>
          <SelectItem value="archived">Archived</SelectItem>
          <SelectItem value="all">All</SelectItem>
        </SelectContent>
      </Select>
      <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
        <SelectTrigger className="h-9 w-[152px] text-[13px]" aria-label="Sort companies">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="name">Name A–Z</SelectItem>
          <SelectItem value="prospects">Most prospects</SelectItem>
          <SelectItem value="newest">Newest</SelectItem>
        </SelectContent>
      </Select>
      <div className="ml-auto">
        <Button size="sm" onClick={() => openCompanyForm(null)}>
          <Plus aria-hidden="true" className="size-3.5" />
          Add company
        </Button>
      </div>
    </div>
  );

  let content: ReactNode;
  if (list.isPending) {
    content = <TableSkeleton rows={8} cols={6} />;
  } else if (list.isError) {
    content = (
      <ErrorState
        message={list.error instanceof Error ? list.error.message : "Could not load companies."}
        onRetry={() => void list.refetch()}
      />
    );
  } else if (rows.length === 0) {
    content = hasFilters ? (
      <EmptyState
        title="No match for these filters"
        description="Try a different search term, or widen the status filter."
        action={{
          label: "Clear filters",
          onClick: () => {
            setSearchInput("");
            setSearch("");
            setStatusFilter("active");
          },
        }}
      />
    ) : (
      <EmptyState
        title="No companies yet"
        description="Companies hold the prospects you research and reach out to."
        action={{ label: "Add company", onClick: () => openCompanyForm(null) }}
      />
    );
  } else {
    content = (
      <div className="overflow-x-auto scroll-slim rounded-md border bg-card">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b bg-surface-subtle/60">
              <th scope="col" className={TH}>Company</th>
              <th scope="col" className={`hidden md:table-cell ${TH}`}>Industry</th>
              <th scope="col" className={TH}>Location</th>
              <th scope="col" className={`hidden text-right md:table-cell ${TH}`}>Size</th>
              <th scope="col" className={`${TH} text-right`}>Prospects</th>
              <th scope="col" className={`hidden text-center md:table-cell ${TH}`}>Website</th>
              <th scope="col" className={`hidden text-center md:table-cell ${TH}`}>LinkedIn</th>
              <th scope="col" className={TH}>Updated</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className="h-10 cursor-pointer border-b transition-colors last:border-0 hover:bg-surface-subtle"
              >
                <td className="px-3">
                  <button
                    type="button"
                    className="block max-w-56 truncate text-left font-medium text-foreground underline-offset-2 hover:text-primary hover:underline"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedId(c.id);
                    }}
                    aria-label={`Open ${c.name} details`}
                  >
                    {c.name}
                  </button>
                </td>
                <td className="hidden px-3 text-muted-foreground md:table-cell">
                  {c.industry ?? <span className="text-muted-foreground/50">—</span>}
                </td>
                <td className="px-3 text-muted-foreground">
                  {c.location ? (
                    <span className="block max-w-56 truncate" title={c.location}>
                      {c.location}
                    </span>
                  ) : (
                    <span className="text-muted-foreground/50">—</span>
                  )}
                </td>
                <td className="hidden px-3 text-right font-num text-muted-foreground md:table-cell">
                  {c.companySize ?? <span className="text-muted-foreground/50">—</span>}
                </td>
                <td className="px-3 text-right">
                  <button
                    type="button"
                    className="font-num text-muted-foreground underline-offset-2 hover:text-primary hover:underline"
                    onClick={(e) => {
                      e.stopPropagation();
                      gotoProspects(c.id);
                    }}
                    aria-label={`Show ${c.prospectCount} prospects at ${c.name}`}
                  >
                    {c.prospectCount}
                  </button>
                </td>
                <td className="hidden px-3 text-center md:table-cell">
                  {c.website ? (
                    <a
                      href={c.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Open website of ${c.name}`}
                      className="inline-flex size-6 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-surface-subtle hover:text-foreground"
                    >
                      <ExternalLink aria-hidden="true" className="size-3.5" />
                    </a>
                  ) : (
                    <span className="text-muted-foreground/50">—</span>
                  )}
                </td>
                <td className="hidden px-3 text-center md:table-cell">
                  {c.linkedinUrl ? (
                    <a
                      href={c.linkedinUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Open LinkedIn page of ${c.name}`}
                      className="inline-flex size-6 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-surface-subtle hover:text-foreground"
                    >
                      <Linkedin aria-hidden="true" className="size-3.5" />
                    </a>
                  ) : (
                    <span className="text-muted-foreground/50">—</span>
                  )}
                </td>
                <td className="px-3">
                  <DateLabel date={c.updatedAt} className="text-muted-foreground" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  const sheet = (
    <Sheet
      open={selectedId !== null}
      onOpenChange={(open) => {
        if (!open) setSelectedId(null);
      }}
    >
      <SheetContent side="right" className="w-full gap-0 sm:max-w-lg">
        {detail.isError ? (
          <div className="p-4 sm:p-5">
            <SheetTitle className="sr-only">Company details</SheetTitle>
            <SheetDescription className="sr-only">The company could not be loaded.</SheetDescription>
            <ErrorState
              message={detail.error instanceof Error ? detail.error.message : "Could not load this company."}
              onRetry={() => void detail.refetch()}
            />
          </div>
        ) : !company ? (
          <div className="space-y-4 p-4 sm:p-5">
            <SheetTitle className="sr-only">Company details</SheetTitle>
            <SheetDescription className="sr-only">Loading company details.</SheetDescription>
            <Skeleton className="h-6 w-44" />
            <Skeleton className="h-4 w-60" />
            <div className="flex gap-2">
              <Skeleton className="h-7 w-20" />
              <Skeleton className="h-7 w-24" />
            </div>
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <>
            <SheetHeader className="border-b p-4 pb-3 sm:p-5 sm:pb-3">
              <SheetTitle className="pr-8 text-base font-semibold leading-6">{company.name}</SheetTitle>
              <SheetDescription className="text-[13px]">
                {[company.industry, company.location, company.companySize].filter(Boolean).join("  ·  ") ||
                  "No industry, location, or size recorded"}
              </SheetDescription>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5 text-[12.5px]"
                  onClick={() => openCompanyForm(company.id)}
                >
                  <Pencil aria-hidden="true" className="size-3.5" />
                  Edit
                </Button>
                {company.prospectCount === 0 ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1.5 text-[12.5px] text-destructive hover:text-destructive"
                    onClick={() => setConfirmDelete(true)}
                  >
                    <Trash2 aria-hidden="true" className="size-3.5" />
                    Delete
                  </Button>
                ) : (
                  <span className="font-num text-[12px] text-muted-foreground">
                    {company.prospectCount} prospects
                  </span>
                )}
              </div>
              {company.prospectCount > 0 ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-sm bg-surface-subtle px-2.5 py-2">
                  <p className="text-[12.5px] text-muted-foreground">
                    Has{" "}
                    <span className="font-num font-medium text-foreground">{company.prospectCount}</span>{" "}
                    prospects attached — re-assign them before deleting.
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-[12px]"
                    onClick={() => gotoProspects(company.id)}
                  >
                    View prospects
                  </Button>
                </div>
              ) : null}
            </SheetHeader>
            <div className="flex-1 overflow-y-auto scroll-slim">
              <div className="space-y-5 p-4 sm:p-5">
                {/* Website + LinkedIn (plain anchors) */}
                <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5">
                  {company.website ? (
                    <a
                      href={company.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-[13px] text-primary underline-offset-2 hover:underline"
                    >
                      <ExternalLink aria-hidden="true" className="size-3.5" />
                      Website
                    </a>
                  ) : (
                    <span className="text-[13px] text-muted-foreground/60">No website</span>
                  )}
                  {company.linkedinUrl ? (
                    <a
                      href={company.linkedinUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-[13px] text-primary underline-offset-2 hover:underline"
                    >
                      <Linkedin aria-hidden="true" className="size-3.5" />
                      LinkedIn page
                    </a>
                  ) : (
                    <span className="text-[13px] text-muted-foreground/60">No LinkedIn page</span>
                  )}
                </div>

                {/* Notes */}
                <section className="space-y-1.5">
                  <SectionLabel>Notes</SectionLabel>
                  {company.notes ? (
                    <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground/90">
                      {company.notes}
                    </p>
                  ) : (
                    <p className="text-[13px] text-muted-foreground/60">No notes yet.</p>
                  )}
                </section>

                {/* Campaigns associated via prospects */}
                <section className="space-y-1.5">
                  <SectionLabel>Campaigns</SectionLabel>
                  {company.campaigns.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {company.campaigns.map((camp) => (
                        <span
                          key={camp.id}
                          title={`Campaign status: ${camp.status}`}
                          className="inline-flex items-center rounded-sm bg-surface-subtle px-2 py-0.5 text-[11.5px] text-muted-foreground"
                        >
                          {camp.name}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[13px] text-muted-foreground/60">
                      No campaign is working this company yet.
                    </p>
                  )}
                </section>

                {/* Prospects */}
                <section className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <SectionLabel>Prospects ({company.prospects.length})</SectionLabel>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2.5 text-[12px]"
                      onClick={() => gotoProspects(company.id)}
                    >
                      View in table
                    </Button>
                  </div>
                  {company.prospects.length === 0 ? (
                    <p className="py-1 text-[13px] text-muted-foreground/60">
                      No prospects attached to this company yet.
                    </p>
                  ) : (
                    <ul className="max-h-96 divide-y overflow-y-auto scroll-slim rounded-md border bg-card">
                      {company.prospects.map((p) => (
                        <li
                          key={p.id}
                          className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1.5 transition-colors hover:bg-surface-subtle"
                        >
                          <button
                            type="button"
                            className="text-[13px] font-medium text-foreground underline-offset-2 hover:text-primary hover:underline"
                            onClick={() => openProspect(p.id)}
                          >
                            {fullName(p)}
                          </button>
                          {p.jobTitle ? (
                            <span
                              className="max-w-44 truncate text-[12.5px] text-muted-foreground"
                              title={p.jobTitle}
                            >
                              {p.jobTitle}
                            </span>
                          ) : null}
                          <span className="ml-auto flex items-center gap-2">
                            <StatusBadge status={p.status} />
                            <DueDateLabel date={p.nextFollowUpDate} />
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                {/* Recent activity (read-only — the API items carry no prospectId) */}
                <section className="space-y-2">
                  <SectionLabel>Recent activity</SectionLabel>
                  {company.recentActivities.length === 0 ? (
                    <p className="py-1 text-[13px] text-muted-foreground/60">
                      No activity recorded for this company yet.
                    </p>
                  ) : (
                    <ul className="divide-y rounded-md border bg-card">
                      {company.recentActivities.map((a) => (
                        <li key={a.id} className="flex items-baseline gap-2.5 px-3 py-1.5">
                          <ActivityTypeBadge type={a.activityType} />
                          <span className="min-w-0 flex-1">
                            {a.prospectName ? (
                              <span className="text-[13px] text-foreground">{a.prospectName}</span>
                            ) : null}
                            {a.notes ? (
                              <span
                                className="block truncate text-[12.5px] text-muted-foreground"
                                title={a.notes}
                              >
                                {a.notes}
                              </span>
                            ) : null}
                          </span>
                          <time
                            dateTime={a.occurredAt}
                            title={formatDate(a.occurredAt)}
                            className="font-num shrink-0 text-[11.5px] text-muted-foreground"
                          >
                            {formatDate(a.occurredAt, "MMM d, yyyy")}
                          </time>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            </div>

            <ConfirmDialog
              open={confirmDelete}
              onOpenChange={setConfirmDelete}
              title="Delete company"
              description={`This permanently deletes "${company.name}" from your companies list.`}
              consequences="Removes the company and its notes permanently."
              confirmLabel="Delete company"
              destructive
              onConfirm={() => removeCompany.mutate(company.id)}
            />
          </>
        )}
      </SheetContent>
    </Sheet>
  );

  return (
    <div className="space-y-3">
      {toolbar}
      {content}
      {sheet}
    </div>
  );
}
