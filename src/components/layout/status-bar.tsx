"use client";

// Footer: slim operator status bar (sticky bottom per layout contract).
// Shows live counts from the dashboard query — real data, no decoration.

import { useQuery } from "@tanstack/react-query";
import { qk, dashboardApi } from "@/lib/api-client";
import { useAppStore } from "@/state/app-state";

export function StatusBar() {
  const view = useAppStore((s) => s.view);
  const setView = useAppStore((s) => s.setView);
  const { data: dash } = useQuery({
    queryKey: qk.dashboard,
    queryFn: dashboardApi.get,
    refetchInterval: 120_000,
  });

  return (
    <footer className="mt-auto border-t bg-surface-subtle">
      <div className="flex h-8 items-center gap-3 overflow-x-auto px-3 text-[11px] text-muted-foreground sm:px-4">
        <span className="font-mono font-semibold text-foreground/70">OutreachOS</span>
        <span aria-hidden className="text-border-strong">|</span>
        <button
          type="button"
          onClick={() => setView("prospects")}
          className="font-num whitespace-nowrap hover:text-foreground hover:underline"
        >
          {dash?.totals.prospects ?? "…"} prospects
        </button>
        <button
          type="button"
          onClick={() => setView("companies")}
          className="font-num whitespace-nowrap hover:text-foreground hover:underline"
        >
          {dash?.totals.companies ?? "…"} companies
        </button>
        <button
          type="button"
          onClick={() => setView("campaigns")}
          className="font-num whitespace-nowrap hover:text-foreground hover:underline"
        >
          {dash?.totals.activeCampaigns ?? "…"} active campaigns
        </button>
        <span aria-hidden className="ml-auto hidden text-border-strong sm:block">|</span>
        <span className="ml-auto whitespace-nowrap sm:ml-0">Local database · private workspace</span>
        {view === "dashboard" && dash ? (
          <span aria-live="polite" className="sr-only">
            {dash.totals.prospects} prospects, {dash.today.overdueFollowUps} overdue follow-ups,
            {dash.today.dueToday} due today.
          </span>
        ) : null}
      </div>
    </footer>
  );
}
