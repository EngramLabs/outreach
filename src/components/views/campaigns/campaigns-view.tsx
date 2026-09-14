"use client";

// Campaigns view (spec §14): compact operator rows (not marketing cards) with
// honest computed stats — rates that have no denominator render as "—". Each
// row supports an inline quick status change; the detail sheet carries the
// full 3×3 stats grid, prospects list, and recent activity. All numbers come
// from the API — no local mock data.

import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DueDateLabel, formatDate } from "@/components/shared/date-label";
import { ActivityTypeBadge, StatusBadge } from "@/components/shared/status-badge";
import { EmptyState, ErrorState, Stat, TableSkeleton } from "@/components/shared/states";
import { campaignsApi, qk } from "@/lib/api-client";
import type { CampaignRow, CampaignStats } from "@/lib/types";
import { useAppStore } from "@/state/app-state";
import { toast } from "@/hooks/use-toast";

/** Rates arrive as 0–1 fractions, or null when the denominator is zero. */
const pct = (v: number | null): string => (v == null ? "—" : `${Math.round(v * 100)}%`);

/** Statuses offered for the inline quick change (Archived stays a deliberate sheet/detail action). */
const QUICK_STATUSES: readonly string[] = ["Draft", "Active", "Paused", "Completed"];

const fullName = (p: { firstName: string; lastName: string | null }): string =>
  p.lastName ? `${p.firstName} ${p.lastName}` : p.firstName;

const range = (s: string | null, e: string | null, pattern = "MMM d, yyyy"): string =>
  `${formatDate(s, pattern)} → ${formatDate(e, pattern)}`;

const HD = "text-[11px] font-medium uppercase tracking-wide text-muted-foreground";

const GRID =
  "md:grid md:h-10 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.3fr)_128px_64px_minmax(0,1.8fr)] md:items-center md:gap-3";

// GET /api/campaigns/:id response (subset this view renders).
type CampaignDetailProspect = {
  id: string;
  firstName: string;
  lastName: string | null;
  jobTitle: string | null;
  status: string;
  priority: string;
  companyName: string | null;
  lastContactDate: string | null;
  nextFollowUpDate: string | null;
};

type CampaignDetailActivity = {
  id: string;
  activityType: string;
  occurredAt: string;
  prospectName: string | null;
  notes: string | null;
};

type CampaignDetail = {
  id: string;
  name: string;
  description: string | null;
  targetAudience: string | null;
  status: string;
  startDate: string | null;
  endDate: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  stats: CampaignStats;
  prospects: CampaignDetailProspect[];
  recentActivities: CampaignDetailActivity[];
};

// The PATCH endpoint nulls optional fields that are omitted from the body
// (its zod update schema maps undefined → null). A quick status change must
// therefore send the FULL campaign payload, not just { status }, or the
// audience/description/notes would be wiped.
type CampaignWrite = {
  name: string;
  description: string | null;
  targetAudience: string | null;
  status: string;
  startDate: string | null;
  endDate: string | null;
  notes: string | null;
};

function toWrite(
  c: Pick<CampaignWrite, "name" | "description" | "targetAudience" | "startDate" | "endDate" | "notes">,
  status: string,
): CampaignWrite {
  return {
    name: c.name,
    description: c.description,
    targetAudience: c.targetAudience,
    status,
    startDate: c.startDate,
    endDate: c.endDate,
    notes: c.notes,
  };
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </h3>
  );
}

/** Inline status select for quick changes (list rows + sheet header). */
function StatusSelect({
  value,
  name,
  onChange,
  disabled,
}: {
  value: string;
  name: string;
  onChange: (status: string) => void;
  disabled?: boolean;
}) {
  const options = QUICK_STATUSES.includes(value) ? QUICK_STATUSES : [value, ...QUICK_STATUSES];
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger size="sm" className="h-7 gap-1.5 px-2 text-[12px]" aria-label={`Status of ${name}`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((s) => (
          <SelectItem key={s} value={s}>
            {s}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function CampaignsView() {
  const setView = useAppStore((s) => s.setView);
  const openCampaignForm = useAppStore((s) => s.openCampaignForm);
  const openProspect = useAppStore((s) => s.openProspect);
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<"open" | "all">("open");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const list = useQuery({
    queryKey: qk.campaigns({ scope: statusFilter }),
    queryFn: () => campaignsApi.list({ status: statusFilter === "open" ? "active-only" : "all" }),
  });

  const detail = useQuery({
    queryKey: qk.campaign(selectedId ?? ""),
    queryFn: () => campaignsApi.get(selectedId!) as Promise<CampaignDetail>,
    enabled: selectedId !== null,
  });
  const campaign = detail.data;

  const statusChange = useMutation({
    mutationFn: (vars: { id: string; name: string; write: CampaignWrite }) =>
      campaignsApi.update(vars.id, vars.write),
    onSuccess: async (_res, vars) => {
      toast({
        title: "Status updated",
        description: `"${vars.name}" is now ${vars.write.status}.`,
      });
      await queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      await queryClient.invalidateQueries({ queryKey: ["campaign"] });
    },
    onError: (err: Error) => {
      toast({
        title: "Could not update the status",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const removeCampaign = useMutation({
    mutationFn: (id: string) => campaignsApi.remove(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      await queryClient.invalidateQueries({ queryKey: ["campaign"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast({ title: "Campaign deleted", description: "The campaign and its notes were removed." });
      setConfirmDelete(false);
      setSelectedId(null);
    },
    onError: (err: Error) => {
      setConfirmDelete(false);
      toast({
        title: "Could not delete the campaign",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const rows: CampaignRow[] = list.data?.data ?? [];

  const gotoProspects = (campaignId: string, status?: string) => {
    setSelectedId(null);
    setView("prospects", status ? { campaignId, status } : { campaignId });
  };

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as "open" | "all")}>
        <SelectTrigger className="h-9 w-[184px] text-[13px]" aria-label="Filter campaigns by status">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="open">Not archived</SelectItem>
          <SelectItem value="all">All (incl. archived)</SelectItem>
        </SelectContent>
      </Select>
      <div className="ml-auto">
        <Button size="sm" onClick={() => openCampaignForm(null)}>
          <Plus aria-hidden="true" className="size-3.5" />
          New campaign
        </Button>
      </div>
    </div>
  );

  let content: ReactNode;
  if (list.isPending) {
    content = <TableSkeleton rows={4} cols={5} />;
  } else if (list.isError) {
    content = (
      <ErrorState
        message={list.error instanceof Error ? list.error.message : "Could not load campaigns."}
        onRetry={() => void list.refetch()}
      />
    );
  } else if (rows.length === 0) {
    content =
      statusFilter === "all" ? (
        <EmptyState
          title="No match for these filters"
          description="No campaigns exist for this filter."
          action={{ label: "Show not archived", onClick: () => setStatusFilter("open") }}
        />
      ) : (
        <EmptyState
          title="No campaigns yet"
          description="Group related outreach into a campaign so results can be compared honestly."
          action={{ label: "Create campaign", onClick: () => openCampaignForm(null) }}
        />
      );
  } else {
    content = (
      <div className="rounded-md border bg-card">
        <div className={`hidden border-b bg-surface-subtle/60 px-3 md:grid md:h-8 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.3fr)_128px_64px_minmax(0,1.8fr)] md:items-center md:gap-3`}>
          <span className={HD}>Campaign</span>
          <span className={HD}>Target audience</span>
          <span className={HD}>Dates</span>
          <span className={`${HD} text-right`}>Prospects</span>
          <span className={HD}>Results</span>
        </div>
        {rows.map((c) => (
          <div
            key={c.id}
            onClick={() => setSelectedId(c.id)}
            className={`flex cursor-pointer flex-col gap-1.5 border-b px-3 py-2.5 transition-colors last:border-0 hover:bg-surface-subtle ${GRID} md:py-1`}
          >
            <div className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                className="min-w-0 truncate text-left text-[13px] font-medium text-foreground underline-offset-2 hover:text-primary hover:underline"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedId(c.id);
                }}
                aria-label={`Open ${c.name} details`}
              >
                {c.name}
              </button>
              <span
                className="ml-auto inline-flex shrink-0"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              >
                <StatusSelect
                  value={c.status}
                  name={c.name}
                  disabled={statusChange.isPending && statusChange.variables?.id === c.id}
                  onChange={(status) =>
                    statusChange.mutate({ id: c.id, name: c.name, write: toWrite(c, status) })
                  }
                />
              </span>
            </div>
            <span
              className="truncate text-[12.5px] text-muted-foreground"
              title={c.targetAudience ?? undefined}
            >
              {c.targetAudience ?? "No target audience set"}
            </span>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 md:contents">
              <span
                className="font-num whitespace-nowrap text-[12.5px] text-muted-foreground"
                title={range(c.startDate, c.endDate)}
              >
                {range(c.startDate, c.endDate, "MMM d")}
              </span>
              <button
                type="button"
                className="font-num text-[12.5px] text-muted-foreground underline-offset-2 hover:text-primary hover:underline md:justify-self-end"
                onClick={(e) => {
                  e.stopPropagation();
                  gotoProspects(c.id);
                }}
                aria-label={`Show ${c.stats.totalProspects} prospects in ${c.name}`}
              >
                {c.stats.totalProspects}
              </button>
              <span
                className="font-num min-w-0 flex-1 truncate text-[12px] text-muted-foreground"
                title={`requests ${c.stats.requestsSent} · accepted ${pct(c.stats.acceptanceRate)} · replies ${pct(c.stats.replyRate)} · meetings ${c.stats.meetings} · conversions ${c.stats.conversions}`}
              >
                requests {c.stats.requestsSent} · accepted {pct(c.stats.acceptanceRate)} · replies{" "}
                {pct(c.stats.replyRate)} · meetings {c.stats.meetings} · conv. {c.stats.conversions}
              </span>
            </div>
          </div>
        ))}
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
      <SheetContent side="right" className="w-full gap-0 sm:max-w-xl">
        {detail.isError ? (
          <div className="p-4 sm:p-5">
            <SheetTitle className="sr-only">Campaign details</SheetTitle>
            <SheetDescription className="sr-only">The campaign could not be loaded.</SheetDescription>
            <ErrorState
              message={detail.error instanceof Error ? detail.error.message : "Could not load this campaign."}
              onRetry={() => void detail.refetch()}
            />
          </div>
        ) : !campaign ? (
          <div className="space-y-4 p-4 sm:p-5">
            <SheetTitle className="sr-only">Campaign details</SheetTitle>
            <SheetDescription className="sr-only">Loading campaign details.</SheetDescription>
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64" />
            <div className="flex gap-2">
              <Skeleton className="h-7 w-28" />
              <Skeleton className="h-7 w-20" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              {Array.from({ length: 9 }).map((_, i) => (
                <Skeleton key={i} className="h-15 w-full" />
              ))}
            </div>
            <Skeleton className="h-32 w-full" />
          </div>
        ) : (
          <>
            <SheetHeader className="border-b p-4 pb-3 sm:p-5 sm:pb-3">
              <div className="flex items-center justify-between gap-3">
                <SheetTitle className="min-w-0 truncate pr-6 text-base font-semibold leading-6">
                  {campaign.name}
                </SheetTitle>
                <span
                  className="inline-flex shrink-0"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <StatusSelect
                    value={campaign.status}
                    name={campaign.name}
                    disabled={
                      statusChange.isPending && statusChange.variables?.id === campaign.id
                    }
                    onChange={(status) =>
                      statusChange.mutate({
                        id: campaign.id,
                        name: campaign.name,
                        write: toWrite(campaign, status),
                      })
                    }
                  />
                </span>
              </div>
              <SheetDescription className="truncate text-[13px]">
                {campaign.targetAudience ?? "No target audience recorded"}
              </SheetDescription>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-[12.5px]"
                  onClick={() => gotoProspects(campaign.id)}
                >
                  View prospects
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5 text-[12.5px]"
                  onClick={() => openCampaignForm(campaign.id)}
                >
                  <Pencil aria-hidden="true" className="size-3.5" />
                  Edit
                </Button>
                {campaign.stats.totalProspects === 0 ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1.5 text-[12.5px] text-destructive hover:text-destructive"
                    onClick={() => setConfirmDelete(true)}
                  >
                    <Trash2 aria-hidden="true" className="size-3.5" />
                    Delete
                  </Button>
                ) : null}
              </div>
              {campaign.stats.totalProspects > 0 ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-sm bg-surface-subtle px-2.5 py-2">
                  <p className="text-[12.5px] text-muted-foreground">
                    Has{" "}
                    <span className="font-num font-medium text-foreground">
                      {campaign.stats.totalProspects}
                    </span>{" "}
                    prospects — they must be moved to another campaign first.
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-[12px]"
                    onClick={() => gotoProspects(campaign.id)}
                  >
                    View prospects
                  </Button>
                </div>
              ) : null}
            </SheetHeader>
            <div className="flex-1 overflow-y-auto scroll-slim">
              <div className="space-y-5 p-4 sm:p-5">
                {/* Description, audience, dates */}
                <section className="space-y-2">
                  {campaign.description ? (
                    <p className="text-[13px] leading-relaxed text-foreground/90">
                      {campaign.description}
                    </p>
                  ) : null}
                  <dl className="grid grid-cols-[104px_1fr] gap-x-3 gap-y-1.5 text-[13px]">
                    <dt className="text-muted-foreground">Audience</dt>
                    <dd className="min-w-0 break-words">{campaign.targetAudience ?? "—"}</dd>
                    <dt className="text-muted-foreground">Dates</dt>
                    <dd className="font-num">{range(campaign.startDate, campaign.endDate)}</dd>
                  </dl>
                </section>

                {/* Notes */}
                <section className="space-y-1.5">
                  <SectionLabel>Notes</SectionLabel>
                  {campaign.notes ? (
                    <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground/90">
                      {campaign.notes}
                    </p>
                  ) : (
                    <p className="text-[13px] text-muted-foreground/60">No notes yet.</p>
                  )}
                </section>

                {/* Stats — honest: null rates render as "—" */}
                <section className="space-y-2">
                  <SectionLabel>Results</SectionLabel>
                  <div className="grid grid-cols-3 gap-2">
                    <Stat
                      label="Total prospects"
                      value={campaign.stats.totalProspects}
                      onClick={() => gotoProspects(campaign.id)}
                    />
                    <Stat label="Requests sent" value={campaign.stats.requestsSent} />
                    <Stat label="Accepted" value={campaign.stats.accepted} />
                    <Stat label="Acceptance rate" value={pct(campaign.stats.acceptanceRate)} />
                    <Stat label="Messages sent" value={campaign.stats.messagesSent} />
                    <Stat label="Replies" value={campaign.stats.replies} />
                    <Stat label="Reply rate" value={pct(campaign.stats.replyRate)} />
                    <Stat label="Meetings" value={campaign.stats.meetings} />
                    <Stat
                      label="Conversions"
                      value={campaign.stats.conversions}
                      onClick={() => gotoProspects(campaign.id, "Converted")}
                    />
                  </div>
                </section>

                {/* Prospects */}
                <section className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <SectionLabel>Prospects ({campaign.prospects.length})</SectionLabel>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2.5 text-[12px]"
                      onClick={() => gotoProspects(campaign.id)}
                    >
                      View in table
                    </Button>
                  </div>
                  {campaign.prospects.length === 0 ? (
                    <p className="py-1 text-[13px] text-muted-foreground/60">
                      No prospects assigned to this campaign yet.
                    </p>
                  ) : (
                    <ul className="max-h-96 divide-y overflow-y-auto scroll-slim rounded-md border bg-card">
                      {campaign.prospects.map((p) => (
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
                              className="max-w-40 truncate text-[12.5px] text-muted-foreground"
                              title={p.jobTitle}
                            >
                              {p.jobTitle}
                            </span>
                          ) : null}
                          {p.companyName ? (
                            <span
                              className="max-w-40 truncate text-[12.5px] text-muted-foreground"
                              title={p.companyName}
                            >
                              {p.companyName}
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
                  {campaign.recentActivities.length === 0 ? (
                    <p className="py-1 text-[13px] text-muted-foreground/60">
                      No activity recorded in this campaign yet.
                    </p>
                  ) : (
                    <ul className="divide-y rounded-md border bg-card">
                      {campaign.recentActivities.map((a) => (
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
              title="Delete campaign"
              description={`This permanently deletes "${campaign.name}" and its notes.`}
              consequences="Activities logged in this campaign keep their notes but lose the campaign link."
              confirmLabel="Delete campaign"
              destructive
              onConfirm={() => removeCampaign.mutate(campaign.id)}
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
