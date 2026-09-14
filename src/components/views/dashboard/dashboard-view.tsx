"use client";

// Dashboard (spec §10) — "What needs my attention today?"
// Actionable counts over vanity KPIs: every number opens the view that
// explains it, every list row opens the record behind it. Rates render "—"
// when the denominator is zero — nothing is fabricated.

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { ActivityTypeBadge, StatusBadge } from "@/components/shared/status-badge";
import { DateLabel, timeAgo } from "@/components/shared/date-label";
import {
  CardsSkeleton,
  EmptyState,
  ErrorState,
  SectionHeader,
  Stat,
  TableSkeleton,
} from "@/components/shared/states";
import { dashboardApi, qk } from "@/lib/api-client";
import type { ActivityItem, ProspectRow } from "@/lib/types";
import { useAppStore } from "@/state/app-state";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const ROW_FOCUS =
  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring";

function formatRate(rate: number | null): string {
  if (rate === null) return "—";
  const pct = rate * 100;
  return `${pct < 10 ? pct.toFixed(1) : Math.round(pct)}%`;
}

function fullName(p: { firstName: string; lastName: string | null }): string {
  return `${p.firstName}${p.lastName ? ` ${p.lastName}` : ""}`.trim();
}

/** Measures a container so charts draw in real pixels (crisp labels at any width). */
function useMeasuredWidth() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof ResizeObserver === "undefined") {
      setWidth(el.clientWidth);
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      setWidth(Math.round(w));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

interface DayPoint {
  date: string;
  count: number;
}

/**
 * Hand-rolled SVG bar chart for daily counts. Compact by design: fixed ~96px
 * bar area, sparse x labels (first / middle / last), y-max label, one
 * <title> per bar for hover, and an honest empty note instead of a flat row
 * of nothing when the window is all zeros.
 */
function DayBarChart({
  days,
  emptyNote,
  getBarTitle,
  ariaLabel,
  height = 96,
}: {
  days: DayPoint[];
  emptyNote: string;
  getBarTitle: (d: DayPoint) => string;
  ariaLabel: string;
  height?: number;
}) {
  const { ref, width } = useMeasuredWidth();
  const total = days.reduce((sum, d) => sum + d.count, 0);
  const maxCount = days.length > 0 ? Math.max(...days.map((d) => d.count)) : 0;
  const H = height;
  const AXIS = 18; // x-axis label strip
  const TOP = 12; // headroom for the y-max label
  const usable = H - TOP;

  if (total === 0) {
    return (
      <p className="px-3 py-6 text-center text-[13px] text-muted-foreground">{emptyNote}</p>
    );
  }

  const n = days.length || 1;
  const slot = width / n;
  const barWidth = slot > 6 ? Math.min(22, slot * 0.6) : Math.max(1, slot - 0.5);

  // Sparse date labels: first, middle, last — deduped for short windows.
  const labelIdx = [...new Set([0, Math.floor((n - 1) / 2), n - 1])];

  return (
    <div ref={ref} className="w-full">
      {width > 0 ? (
        <svg
          width={width}
          height={H + AXIS}
          role="img"
          aria-label={`${ariaLabel}, total ${total}`}
          className="block"
        >
          {/* y-axis max value label */}
          <text x={0} y={9} fontSize={10} className="fill-muted-foreground font-num">
            {maxCount}
          </text>
          {/* baseline */}
          <line x1={0} x2={width} y1={H} y2={H} className="stroke-border" strokeWidth={1} />
          {days.map((d, i) => {
            const h =
              d.count === 0 ? 0 : Math.max(3, Math.round((d.count / maxCount) * usable));
            const x = i * slot + (slot - barWidth) / 2;
            if (d.count === 0) return null;
            return (
              <rect
                key={d.date}
                x={x}
                y={H - h}
                width={barWidth}
                height={h}
                rx={1}
                className="fill-chart-1"
              >
                <title>{getBarTitle(d)}</title>
              </rect>
            );
          })}
          {labelIdx.map((i) => {
            const first = i === 0;
            const last = i === n - 1;
            return (
              <text
                key={i}
                x={first ? 0 : last ? width : width / 2}
                y={H + 13}
                textAnchor={first ? "start" : last ? "end" : "middle"}
                fontSize={10}
                className="fill-muted-foreground font-num"
              >
                {format(parseISO(days[i].date), "MMM d")}
              </text>
            );
          })}
        </svg>
      ) : (
        <div style={{ height: H + AXIS }} aria-hidden="true" />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// row primitives
// ---------------------------------------------------------------------------

function ListCard({ children }: { children: React.ReactNode }) {
  return <div className="overflow-hidden rounded-md border bg-card">{children}</div>;
}

function ListNote({ note }: { note: string }) {
  return (
    <div className="rounded-md border bg-card">
      <p className="px-3 py-6 text-center text-[13px] text-muted-foreground">{note}</p>
    </div>
  );
}

/** Compact row: prospect name (opens the record), company, snippet, time ago. */
function ActivityListRow({
  activity,
  onOpen,
  showSnippet = false,
}: {
  activity: ActivityItem;
  onOpen: () => void;
  showSnippet?: boolean;
}) {
  const snippet = (activity.notes ?? activity.messageText ?? "").trim();
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "flex w-full items-baseline gap-2 border-b px-3 py-2 text-left transition-colors last:border-0 hover:bg-surface-subtle",
        ROW_FOCUS,
      )}
    >
      <span className="min-w-0 truncate text-[13px] font-medium text-foreground">
        {activity.prospectName ?? "Unknown prospect"}
      </span>
      {activity.companyName ? (
        <span className="min-w-0 truncate text-[12.5px] text-muted-foreground">
          {activity.companyName}
        </span>
      ) : null}
      {showSnippet && snippet ? (
        <span className="min-w-0 flex-1 truncate text-[12.5px] text-muted-foreground">
          {snippet}
        </span>
      ) : (
        <span className="min-w-0 flex-1" />
      )}
      <span className="shrink-0 font-num text-[11.5px] text-muted-foreground">
        {timeAgo(activity.occurredAt)}
      </span>
    </button>
  );
}

function AddedProspectRow({ prospect, onOpen }: { prospect: ProspectRow; onOpen: () => void }) {
  const context = [prospect.jobTitle, prospect.companyName].filter(Boolean).join(" · ");
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "flex w-full items-center gap-2 border-b px-3 py-2 text-left transition-colors last:border-0 hover:bg-surface-subtle",
        ROW_FOCUS,
      )}
    >
      <span className="min-w-0 truncate text-[13px] font-medium text-foreground">
        {fullName(prospect)}
      </span>
      <span className="min-w-0 flex-1 truncate text-[12.5px] text-muted-foreground">
        {context || "—"}
      </span>
      <StatusBadge status={prospect.status} />
      <DateLabel date={prospect.dateAdded} className="shrink-0 text-[11.5px] text-muted-foreground" />
    </button>
  );
}

function FeedRow({ activity, onOpen }: { activity: ActivityItem; onOpen: () => void }) {
  const snippet = (activity.notes ?? activity.messageText ?? "").trim();
  return (
    <div className="flex items-center gap-2 border-b px-3 py-2 last:border-0">
      <ActivityTypeBadge type={activity.activityType} />
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          "max-w-[45%] min-w-0 shrink-0 truncate text-[13px] font-medium text-foreground hover:text-primary hover:underline",
          ROW_FOCUS,
        )}
      >
        {activity.prospectName ?? "Unknown prospect"}
      </button>
      {snippet ? (
        <span className="min-w-0 flex-1 truncate text-[12.5px] text-muted-foreground">{snippet}</span>
      ) : (
        <span className="min-w-0 flex-1" />
      )}
      <span className="shrink-0 font-num text-[11.5px] text-muted-foreground">
        {timeAgo(activity.occurredAt)}
      </span>
    </div>
  );
}

function PerfLine({
  label,
  value,
  onClick,
  ariaLabel,
}: {
  label: string;
  value: string;
  onClick?: () => void;
  ariaLabel?: string;
}) {
  const inner = (
    <>
      <span className="text-[12.5px] text-muted-foreground">{label}</span>
      <span className={cn("font-num text-[13px] font-medium", value === "—" && "text-muted-foreground/60")}>
        {value}
      </span>
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel ?? `${label}: ${value}. Open the view behind this number.`}
        className={cn(
          "flex w-full items-baseline justify-between gap-3 border-b px-3 py-1.5 text-left transition-colors last:border-0 hover:bg-surface-subtle",
          ROW_FOCUS,
        )}
      >
        {inner}
      </button>
    );
  }
  return (
    <div className="flex w-full items-baseline justify-between gap-3 border-b px-3 py-1.5 last:border-0">
      {inner}
    </div>
  );
}

// ---------------------------------------------------------------------------
// view
// ---------------------------------------------------------------------------

export function DashboardView() {
  const setView = useAppStore((s) => s.setView);
  const openProspect = useAppStore((s) => s.openProspect);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: qk.dashboard,
    queryFn: () => dashboardApi.get(),
  });

  if (isLoading) {
    return (
      <div className="space-y-6" aria-busy="true">
        <SectionHeader title="Today" description="What needs your attention right now." />
        <CardsSkeleton cards={4} />
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="space-y-5 lg:col-span-2">
            <TableSkeleton rows={3} cols={3} />
            <TableSkeleton rows={3} cols={3} />
            <TableSkeleton rows={3} cols={4} />
          </div>
          <div className="space-y-5">
            <TableSkeleton rows={8} cols={2} />
            <TableSkeleton rows={5} cols={2} />
          </div>
        </div>
        <TableSkeleton rows={8} cols={3} />
      </div>
    );
  }

  if (error) {
    return (
      <ErrorState
        message={error.message || "The dashboard could not be loaded."}
        onRetry={() => refetch()}
        className="mt-4"
      />
    );
  }

  if (!data) return null;

  const { today, pipeline, performance } = data;
  const openProspectById = (id: string) => () => openProspect(id);

  return (
    <div className="space-y-6">
      {/* TODAY — attention counts, each one clicks into its queue */}
      <section className="space-y-3">
        <SectionHeader
          title="Today"
          description="What needs your attention right now — overdue work first."
        />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat
            label="Overdue follow-ups"
            value={today.overdueFollowUps}
            tone={today.overdueFollowUps > 0 ? "danger" : "default"}
            onClick={() => setView("followups")}
          />
          <Stat
            label="Due today"
            value={today.dueToday}
            tone={today.dueToday > 0 ? "warning" : "default"}
            onClick={() => setView("followups")}
          />
          <Stat
            label="Needs verification"
            value={today.needsVerification}
            onClick={() => setView("research")}
          />
          <Stat label="In research" value={today.researchQueue} onClick={() => setView("research")} />
        </div>
      </section>

      {/* Main grid: recent work (left) / live shape of the pipeline (right).
          min-w-0 lets the grid track shrink so row truncation takes over. */}
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <section className="space-y-3">
            <SectionHeader
              title="Recent acceptances"
              description="Connections accepted in the last 14 days."
            />
            {today.recentAcceptances.length === 0 ? (
              <ListNote note="No new connections in the last 14 days." />
            ) : (
              <ListCard>
                {today.recentAcceptances.map((a) => (
                  <ActivityListRow
                    key={a.id}
                    activity={a}
                    onOpen={openProspectById(a.prospectId)}
                  />
                ))}
              </ListCard>
            )}
          </section>

          <section className="space-y-3">
            <SectionHeader
              title="Recent replies"
              description="Replies received in the last 14 days."
            />
            {today.recentReplies.length === 0 ? (
              <ListNote note="No replies yet — keep the follow-ups flowing." />
            ) : (
              <ListCard>
                {today.recentReplies.map((a) => (
                  <ActivityListRow
                    key={a.id}
                    activity={a}
                    showSnippet
                    onOpen={openProspectById(a.prospectId)}
                  />
                ))}
              </ListCard>
            )}
          </section>

          <section className="space-y-3">
            <SectionHeader
              title="Recently added prospects"
              description="The newest records in your pipeline."
            />
            {today.recentlyAddedProspects.length === 0 ? (
              <ListNote note="No prospects added in the last 14 days." />
            ) : (
              <ListCard>
                {today.recentlyAddedProspects.map((p) => (
                  <AddedProspectRow key={p.id} prospect={p} onOpen={openProspectById(p.id)} />
                ))}
              </ListCard>
            )}
          </section>
        </div>

        <div className="min-w-0 space-y-6">
          <section className="space-y-3">
            <SectionHeader
              title="Pipeline"
              description="Live prospects by stage — click to open the stage filtered."
            />
            <ListCard>
              {pipeline.map((row) => (
                <button
                  key={row.status}
                  type="button"
                  onClick={() => setView("prospects", { status: row.status })}
                  aria-label={`${row.status}: ${row.count} prospects. Open filtered view.`}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 border-b px-3 py-1.5 text-left transition-colors last:border-0 hover:bg-surface-subtle",
                    ROW_FOCUS,
                    row.count === 0 && "opacity-55",
                  )}
                >
                  <StatusBadge status={row.status} />
                  <span
                    className={cn(
                      "font-num text-[13px] font-medium",
                      row.count === 0 ? "text-muted-foreground" : "text-foreground",
                    )}
                  >
                    {row.count}
                  </span>
                </button>
              ))}
            </ListCard>
          </section>

          <section className="space-y-3">
            <SectionHeader
              title="Performance"
              description="Outreach outcomes over the last 30 days."
            />
            <ListCard>
              <PerfLine
                label="Requests sent"
                value={String(performance.requestsSent)}
                onClick={() => setView("activities")}
              />
              <PerfLine
                label="Acceptance rate"
                value={formatRate(performance.acceptanceRate)}
                onClick={() => setView("analytics")}
              />
              <PerfLine
                label="Messages sent"
                value={String(performance.messagesSent)}
                onClick={() => setView("activities")}
              />
              <PerfLine
                label="Reply rate"
                value={formatRate(performance.replyRate)}
                onClick={() => setView("analytics")}
              />
              <PerfLine label="Meetings" value={String(performance.meetings)} />
              <PerfLine label="Conversions" value={String(performance.conversions)} />
            </ListCard>
          </section>
        </div>
      </div>

      {/* ACTIVITY — volume + the freshest logged work */}
      <section className="space-y-3 border-t pt-5">
        <SectionHeader
          title="Activity"
          description="Daily volume over the last 14 days and the most recent logged work."
        />
        <div className="rounded-md border bg-card px-3 py-3">
          <DayBarChart
            days={data.activityVolume}
            emptyNote="No activity in the last 14 days."
            ariaLabel="Activity per day over the last 14 days"
            getBarTitle={(d) =>
              `${format(parseISO(d.date), "MMM d")} — ${d.count} ${d.count === 1 ? "activity" : "activities"}`
            }
          />
        </div>
        {data.recentActivity.length === 0 ? (
          <ListCard>
            <EmptyState
              title="No activity yet"
              description="Log outreach work from a prospect's profile and the trail shows up here."
            />
          </ListCard>
        ) : (
          <ListCard>
            <div className="max-h-[430px] overflow-y-auto scroll-slim">
              {data.recentActivity.map((a) => (
                <FeedRow key={a.id} activity={a} onOpen={openProspectById(a.prospectId)} />
              ))}
            </div>
          </ListCard>
        )}
      </section>
    </div>
  );
}
