"use client";

// Analytics (spec §20) — honest numbers for a chosen window. Rates render "—"
// when the denominator is zero; distributions are labeled as current
// snapshots (the backend computes them un-range-limited); charts are
// hand-rolled SVG so the bundle stays honest.

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  CardsSkeleton,
  ErrorState,
  SectionHeader,
  Stat,
  TableSkeleton,
} from "@/components/shared/states";
import { analyticsApi, qk } from "@/lib/api-client";
import { useAppStore } from "@/state/app-state";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const ROW_FOCUS =
  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring";

type RangeKey = "7d" | "30d" | "90d" | "year" | "custom";

const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "90d", label: "90 days" },
  { key: "year", label: "This year" },
  { key: "custom", label: "Custom" },
];

interface DayPoint {
  date: string;
  count: number;
}

function formatRate(rate: number | null): string {
  if (rate === null) return "—";
  const pct = rate * 100;
  return `${pct < 10 ? pct.toFixed(1) : Math.round(pct)}%`;
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

function axisDateLabel(date: string, sparse: boolean): string {
  return format(parseISO(date), sparse ? "MMM d, yy" : "MMM d");
}

function ListCard({ children }: { children: React.ReactNode }) {
  return <div className="overflow-hidden rounded-md border bg-card">{children}</div>;
}

/** 6px proportion bar used across the distribution tables. */
function ProportionBar({ value, max }: { value: number; max: number }) {
  const width = max > 0 && value > 0 ? Math.max(2, (value / max) * 100) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-sm bg-surface-subtle">
      <div className="h-full rounded-sm bg-primary/70" style={{ width: `${width}%` }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// charts (hand-rolled SVG — no charting library)
// ---------------------------------------------------------------------------

/** Daily counts as compact bars (prospects added over time). */
function DayBarChart({ days, emptyNote }: { days: DayPoint[]; emptyNote: string }) {
  const { ref, width } = useMeasuredWidth();
  const total = days.reduce((sum, d) => sum + d.count, 0);
  const maxCount = days.length > 0 ? Math.max(...days.map((d) => d.count)) : 0;
  const H = 64;
  const AXIS = 18;
  const TOP = 12;
  const usable = H - TOP;

  if (total === 0) {
    return (
      <p className="px-3 py-5 text-center text-[13px] text-muted-foreground">{emptyNote}</p>
    );
  }

  const n = days.length || 1;
  const sparse = n > 92;
  const slot = width / n;
  const barWidth = slot > 6 ? Math.min(22, slot * 0.6) : Math.max(1, slot - 0.5);
  const labelIdx = [...new Set([0, Math.floor((n - 1) / 2), n - 1])];

  return (
    <div ref={ref} className="w-full">
      {width > 0 ? (
        <svg
          width={width}
          height={H + AXIS}
          role="img"
          aria-label={`Prospects added per day, total ${total}`}
          className="block"
        >
          <text x={0} y={9} fontSize={10} className="fill-muted-foreground font-num">
            {maxCount}
          </text>
          <line x1={0} x2={width} y1={H} y2={H} className="stroke-border" strokeWidth={1} />
          {days.map((d, i) => {
            if (d.count === 0) return null;
            const h = Math.max(3, Math.round((d.count / maxCount) * usable));
            const x = i * slot + (slot - barWidth) / 2;
            return (
              <rect
                key={d.date}
                x={x}
                y={H - h}
                width={barWidth}
                height={h}
                rx={1}
                className="fill-chart-2"
              >
                <title>
                  {`${format(parseISO(d.date), "MMM d, yyyy")} — ${d.count} ${d.count === 1 ? "prospect" : "prospects"} added`}
                </title>
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
                {axisDateLabel(days[i].date, sparse)}
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

/** Daily activity as a polyline with subtle area fill and per-point tooltips. */
function ActivityLineChart({
  days,
  rangeLabel,
}: {
  days: DayPoint[];
  rangeLabel: string;
}) {
  const { ref, width } = useMeasuredWidth();
  const total = days.reduce((sum, d) => sum + d.count, 0);
  const maxCount = days.length > 0 ? Math.max(...days.map((d) => d.count)) : 0;
  const H = 120;
  const AXIS = 18;
  const TOP = 14;

  if (total === 0) {
    return (
      <p className="px-3 py-6 text-center text-[13px] text-muted-foreground">
        No activity recorded in this range yet.
      </p>
    );
  }

  const n = days.length;
  const sparse = n > 92;
  const padX = 4;
  const xAt = (i: number) => (n <= 1 ? width / 2 : padX + (i / (n - 1)) * (width - padX * 2));
  const yAt = (count: number) => H - Math.round((count / maxCount) * (H - TOP));
  const points = days.map((d, i) => ({ x: xAt(i), y: yAt(d.count) }));
  const linePoints = points.map((p) => `${p.x},${p.y}`).join(" ");
  const areaPath = [
    `M ${points[0].x} ${H}`,
    ...points.map((p) => `L ${p.x} ${p.y}`),
    `L ${points[points.length - 1].x} ${H}`,
    "Z",
  ].join(" ");
  const radius = n > 60 ? 1.5 : 2.5;
  const labelIdx = [...new Set([0, Math.floor((n - 1) / 2), n - 1])];

  return (
    <div ref={ref} className="w-full">
      {width > 0 ? (
        <svg
          width={width}
          height={H + AXIS}
          role="img"
          aria-label={`Activity per day over ${rangeLabel}, total ${total} activities`}
          className="block"
        >
          <text x={0} y={9} fontSize={10} className="fill-muted-foreground font-num">
            {maxCount}
          </text>
          <line x1={0} x2={width} y1={H} y2={H} className="stroke-border" strokeWidth={1} />
          {n > 1 ? (
            <path d={areaPath} className="fill-chart-1" fillOpacity={0.1} />
          ) : null}
          <polyline
            points={linePoints}
            fill="none"
            className="stroke-chart-1"
            strokeWidth={1.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {points.map((p, i) => (
            <circle key={days[i].date} cx={p.x} cy={p.y} r={radius} className="fill-chart-1">
              <title>
                {`${format(parseISO(days[i].date), "MMM d, yyyy")} — ${days[i].count} ${days[i].count === 1 ? "activity" : "activities"}`}
              </title>
            </circle>
          ))}
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
                {axisDateLabel(days[i].date, sparse)}
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
// distribution rows
// ---------------------------------------------------------------------------

/** Header matching the 4-column status distribution rows. */
function StatusHeader() {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_2.5rem_minmax(2rem,1fr)_3rem] items-center gap-3 border-b bg-surface-subtle/60 px-3 py-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
      <span>Status</span>
      <span className="text-right">Count</span>
      <span className="hidden sm:block">Distribution</span>
      <span className="text-right">% of live</span>
    </div>
  );
}

/** Header matching the 3-column name distribution rows. */
function NameHeader({ label }: { label: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_2.5rem_minmax(2rem,1fr)] items-center gap-3 border-b bg-surface-subtle/60 px-3 py-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
      <span>{label}</span>
      <span className="text-right">Count</span>
      <span className="hidden sm:block">Distribution</span>
    </div>
  );
}

function StatusDistributionRow({
  status,
  count,
  pct,
  max,
  onClick,
}: {
  status: string;
  count: number;
  pct: number;
  max: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${status}: ${count} prospects (${pct}% of live total). Open filtered view.`}
      className={cn(
        "grid w-full grid-cols-[minmax(0,1fr)_2.5rem_minmax(2rem,1fr)_3rem] items-center gap-3 border-b px-3 py-2 text-left transition-colors last:border-0 hover:bg-surface-subtle",
        ROW_FOCUS,
        count === 0 && "opacity-55",
      )}
    >
      <StatusBadge status={status} />
      <span
        className={cn(
          "text-right font-num text-[13px] font-medium",
          count === 0 ? "text-muted-foreground" : "text-foreground",
        )}
      >
        {count}
      </span>
      <div className="hidden sm:block">
        <ProportionBar value={count} max={max} />
      </div>
      <span className="text-right font-num text-[12px] text-muted-foreground">{pct}%</span>
    </button>
  );
}

function NameDistributionRow({
  name,
  count,
  max,
  onClick,
  ariaLabel,
}: {
  name: string;
  count: number;
  max: number;
  onClick: () => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={cn(
        "grid w-full grid-cols-[minmax(0,1fr)_2.5rem_minmax(2rem,1fr)] items-center gap-3 border-b px-3 py-2 text-left transition-colors last:border-0 hover:bg-surface-subtle",
        ROW_FOCUS,
        count === 0 && "opacity-55",
      )}
    >
      <span className="truncate text-[13px] font-medium text-foreground" title={name}>
        {name}
      </span>
      <span className="text-right font-num text-[13px] font-medium text-foreground">{count}</span>
      <div className="hidden sm:block">
        <ProportionBar value={count} max={max} />
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// view
// ---------------------------------------------------------------------------

export function AnalyticsView() {
  const setView = useAppStore((s) => s.setView);

  const [range, setRange] = useState<RangeKey>("30d");
  const [draftFrom, setDraftFrom] = useState("");
  const [draftTo, setDraftTo] = useState("");
  const [applied, setApplied] = useState<{ from: string; to: string } | null>(null);
  const [rangeError, setRangeError] = useState<string | null>(null);

  const customReady = range !== "custom" || applied !== null;
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: qk.analytics(range, applied?.from, applied?.to),
    queryFn: () => analyticsApi.get(range, applied?.from ?? undefined, applied?.to ?? undefined),
    enabled: customReady,
  });

  function selectRange(key: RangeKey) {
    setRange(key);
    setApplied(null); // non-custom keys never carry custom dates
    setRangeError(null);
  }

  function applyCustom() {
    if (!draftFrom || !draftTo) {
      setRangeError("Pick both a start and an end date.");
      return;
    }
    if (new Date(draftFrom) > new Date(draftTo)) {
      setRangeError("The start must be on or before the end.");
      return;
    }
    setRangeError(null);
    setApplied({ from: draftFrom, to: draftTo });
  }

  let body: React.ReactNode;
  if (!customReady) {
    body = (
      <div className="rounded-md border bg-card px-3 py-8 text-center text-[13px] text-muted-foreground">
        Pick a start and end date above, then apply to compute this range.
      </div>
    );
  } else if (isLoading) {
    body = (
      <div className="space-y-6" aria-busy="true">
        <CardsSkeleton cards={6} />
        <TableSkeleton rows={6} cols={3} />
        <div className="grid gap-5 lg:grid-cols-2">
          <TableSkeleton rows={5} cols={3} />
          <TableSkeleton rows={5} cols={3} />
        </div>
      </div>
    );
  } else if (error) {
    body = (
      <ErrorState
        message={error.message || "Analytics could not be loaded."}
        onRetry={() => refetch()}
      />
    );
  } else if (data) {
    const o = data.outreach;
    const statusRows = [...data.totals.byStatus].sort((a, b) => b.count - a.count);
    const statusTotal = statusRows.reduce((sum, r) => sum + r.count, 0);
    const maxStatus = Math.max(...statusRows.map((r) => r.count), 1);
    const campaignRows = data.totals.byCampaign;
    const maxCampaign = Math.max(...campaignRows.map((r) => r.count), 1);
    const companyRows = data.totals.byCompany;
    const maxCompany = Math.max(...companyRows.map((r) => r.count), 1);
    const ratesUnavailable = o.acceptanceRate === null && o.replyRate === null;

    const funnelRows: { step: string; count: number; conversion: string }[] = [
      { step: "Requests sent", count: o.requestsSent, conversion: "—" },
      {
        step: "Accepted",
        count: o.accepted,
        conversion: o.acceptanceRate === null ? "—" : `${formatRate(o.acceptanceRate)} of requests`,
      },
      { step: "Messages sent", count: o.messagesSent, conversion: "—" },
      {
        step: "Replies",
        count: o.replies,
        conversion: o.replyRate === null ? "—" : `${formatRate(o.replyRate)} of messages`,
      },
      { step: "Meetings", count: o.meetings, conversion: "—" },
      { step: "Conversions", count: o.conversions, conversion: "—" },
    ];

    body = (
      <div className="space-y-6">
        {/* Metrics row */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Requests sent" value={o.requestsSent} hint="in range" />
          <Stat label="Acceptance rate" value={formatRate(o.acceptanceRate)} hint="in range" />
          <Stat label="Messages sent" value={o.messagesSent} hint="in range" />
          <Stat label="Reply rate" value={formatRate(o.replyRate)} hint="in range" />
          <Stat label="Meetings" value={o.meetings} hint="in range" />
          <Stat label="Conversions" value={o.conversions} hint="in range" />
        </div>

        {/* Funnel */}
        <section className="space-y-3 border-t pt-5">
          <SectionHeader
            title="Outreach funnel"
            description="Counts per step in the selected range — conversion is shown only where the denominator exists."
          />
          <ListCard>
            <div className="grid grid-cols-[1fr_auto] items-center gap-6 border-b bg-surface-subtle/60 px-3 py-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase sm:grid-cols-[1fr_auto_auto]">
              <span>Step</span>
              <span className="text-right">Count</span>
              <span className="hidden text-right sm:block">Step conversion</span>
            </div>
            {funnelRows.map((row) => (
              <div
                key={row.step}
                className="grid grid-cols-[1fr_auto] items-center gap-6 border-b px-3 py-2 last:border-0 sm:grid-cols-[1fr_auto_auto]"
              >
                <span className="text-[13px] text-foreground">{row.step}</span>
                <span className="text-right font-num text-[13px] font-medium text-foreground">
                  {row.count}
                </span>
                <span
                  className={cn(
                    "hidden text-right font-num text-[12px] sm:block",
                    row.conversion === "—" ? "text-muted-foreground/60" : "text-muted-foreground",
                  )}
                >
                  {row.conversion}
                </span>
              </div>
            ))}
          </ListCard>
          {ratesUnavailable ? (
            <p className="text-[12.5px] text-muted-foreground">
              Not enough data in this range to compute rates.
            </p>
          ) : null}
        </section>

        {/* Distributions (current snapshot, not range-limited) */}
        <section className="space-y-3 border-t pt-5">
          <SectionHeader
            title="Pipeline distribution"
            description="Live prospects by status — a current snapshot, not range-limited. Click a row to open it filtered."
          />
          <ListCard>
            <StatusHeader />
            {statusRows.map((row) => {
              const pct = statusTotal > 0 ? Math.round((row.count / statusTotal) * 100) : 0;
              return (
                <StatusDistributionRow
                  key={row.status}
                  status={row.status}
                  count={row.count}
                  pct={pct}
                  max={maxStatus}
                  onClick={() => setView("prospects", { status: row.status })}
                />
              );
            })}
          </ListCard>
        </section>

        <div className="grid gap-5 lg:grid-cols-2">
          <section className="min-w-0 space-y-3 border-t pt-5">
            <SectionHeader
              title="By campaign"
              description="Live prospects grouped by campaign. Click a row to open campaigns."
            />
            {campaignRows.length === 0 ? (
              <div className="rounded-md border bg-card">
                <p className="px-3 py-6 text-center text-[13px] text-muted-foreground">
                  No campaigns with prospects yet.
                </p>
              </div>
            ) : (
              <ListCard>
                <NameHeader label="Campaign" />
                {campaignRows.map((row) => (
                  <NameDistributionRow
                    key={row.campaignId}
                    name={row.name}
                    count={row.count}
                    max={maxCampaign}
                    onClick={() => setView("campaigns")}
                    ariaLabel={`${row.name}: ${row.count} prospects. Open campaigns.`}
                  />
                ))}
              </ListCard>
            )}
          </section>

          <section className="min-w-0 space-y-3 border-t pt-5">
            <SectionHeader
              title="By company"
              description="Top companies by live prospect count. Click a row to open those prospects."
            />
            {companyRows.length === 0 ? (
              <div className="rounded-md border bg-card">
                <p className="px-3 py-6 text-center text-[13px] text-muted-foreground">
                  No companies with prospects yet.
                </p>
              </div>
            ) : (
              <ListCard>
                <NameHeader label="Company" />
                {companyRows.map((row) => (
                  <NameDistributionRow
                    key={row.companyId}
                    name={row.name}
                    count={row.count}
                    max={maxCompany}
                    onClick={() => setView("prospects", { companyId: row.companyId })}
                    ariaLabel={`${row.name}: ${row.count} prospects. Open filtered view.`}
                  />
                ))}
              </ListCard>
            )}
          </section>
        </div>

        {/* Time series */}
        <section className="space-y-3 border-t pt-5">
          <SectionHeader
            title="Activity over time"
            description="All logged activity per day in the selected range."
          />
          <div className="rounded-md border bg-card px-3 py-3">
            <ActivityLineChart days={data.series.activityByDay} rangeLabel={data.range.label} />
          </div>
        </section>

        <section className="space-y-3 border-t pt-5">
          <SectionHeader
            title="Prospects added over time"
            description="New records per day in the selected range."
          />
          <div className="rounded-md border bg-card px-3 py-3">
            <DayBarChart days={data.series.prospectsAddedByDay} emptyNote="No prospects added in this range." />
          </div>
        </section>
      </div>
    );
  } else {
    body = null;
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Analytics"
        description="Honest numbers for the selected window — rates only appear when the data can produce them."
        actions={
          <div
            role="group"
            aria-label="Analytics date range"
            className="flex flex-wrap items-center rounded-md border bg-card p-0.5"
          >
            {RANGE_OPTIONS.map((option) => (
              <button
                key={option.key}
                type="button"
                aria-pressed={range === option.key}
                onClick={() => selectRange(option.key)}
                className={cn(
                  "rounded-sm px-2.5 py-1 text-[12.5px] font-medium transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
                  range === option.key
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-surface-subtle hover:text-foreground",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        }
      />

      {range === "custom" ? (
        <div className="flex flex-wrap items-end gap-3 rounded-md border bg-card p-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="analytics-from" className="text-[12px] text-muted-foreground">
              From
            </Label>
            <Input
              id="analytics-from"
              type="date"
              value={draftFrom}
              onChange={(e) => setDraftFrom(e.target.value)}
              className="h-8 w-[150px] font-num text-[13px]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="analytics-to" className="text-[12px] text-muted-foreground">
              To
            </Label>
            <Input
              id="analytics-to"
              type="date"
              value={draftTo}
              onChange={(e) => setDraftTo(e.target.value)}
              className="h-8 w-[150px] font-num text-[13px]"
            />
          </div>
          <Button size="sm" onClick={applyCustom} disabled={!draftFrom || !draftTo}>
            Apply
          </Button>
          {rangeError ? (
            <p role="alert" className="text-[12px] text-destructive">
              {rangeError}
            </p>
          ) : null}
        </div>
      ) : null}

      {data ? (
        <p className="font-num text-[12px] text-muted-foreground">
          {data.range.label} ·{" "}
          {format(parseISO(data.range.from), "MMM d, yyyy")} –{" "}
          {format(parseISO(data.range.to), "MMM d, yyyy")}
        </p>
      ) : null}

      {body}
    </div>
  );
}
