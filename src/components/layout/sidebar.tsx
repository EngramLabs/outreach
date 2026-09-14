"use client";

// Compact functional sidebar (spec §6). Collapsible on desktop, sheet on mobile.
// One flat list — no nested nav groups to hunt through.

import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useAppStore, VIEW_LABELS, type ViewId } from "@/state/app-state";
import { qk, dashboardApi } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  LayoutDashboard,
  Users,
  Building2,
  Megaphone,
  ListTodo,
  Clock3,
  FlaskConical,
  BarChart3,
  ShieldCheck,
  Archive,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  Menu,
} from "lucide-react";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";

const NAV: { id: ViewId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "dashboard", label: VIEW_LABELS.dashboard, icon: LayoutDashboard },
  { id: "prospects", label: VIEW_LABELS.prospects, icon: Users },
  { id: "companies", label: VIEW_LABELS.companies, icon: Building2 },
  { id: "campaigns", label: VIEW_LABELS.campaigns, icon: Megaphone },
  { id: "activities", label: VIEW_LABELS.activities, icon: ListTodo },
  { id: "followups", label: VIEW_LABELS.followups, icon: Clock3 },
  { id: "research", label: VIEW_LABELS.research, icon: FlaskConical },
  { id: "analytics", label: VIEW_LABELS.analytics, icon: BarChart3 },
  { id: "data-quality", label: VIEW_LABELS["data-quality"], icon: ShieldCheck },
  { id: "archive", label: VIEW_LABELS.archive, icon: Archive },
  { id: "settings", label: VIEW_LABELS.settings, icon: Settings },
];

export function SidebarNav({
  collapsed,
  onNavigate,
}: {
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const view = useAppStore((s) => s.view);
  const setView = useAppStore((s) => s.setView);

  const { data: dash } = useQuery({
    queryKey: qk.dashboard,
    queryFn: dashboardApi.get,
    refetchInterval: 120_000,
  });

  // Attention counts — only where work is waiting (no badge spam, spec §27).
  const badges: Partial<Record<ViewId, number>> = {
    followups: (dash?.today.overdueFollowUps ?? 0) + (dash?.today.dueToday ?? 0),
    research: (dash?.today.researchQueue ?? 0) + (dash?.today.needsVerification ?? 0),
  };

  return (
    <nav aria-label="Primary" className="flex h-full flex-col gap-1 px-2 py-2">
      {NAV.map((item) => {
        const active = view === item.id;
        const badge = badges[item.id];
        const Icon = item.icon;
        const button = (
          <button
            type="button"
            onClick={() => {
              setView(item.id);
              onNavigate?.();
            }}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group relative flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium text-sidebar-foreground/85 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-sidebar-ring",
              collapsed && "justify-center px-0",
              active &&
                "bg-sidebar-accent text-sidebar-accent-foreground after:absolute after:left-0 after:top-1/2 after:h-4.5 after:w-[2.5px] after:-translate-y-1/2 after:rounded-full after:bg-primary",
            )}
            title={collapsed ? item.label : undefined}
          >
            <Icon aria-hidden className={cn("size-4 shrink-0", active ? "text-primary" : "text-sidebar-foreground/60 group-hover:text-sidebar-foreground")} />
            {!collapsed ? <span className="truncate">{item.label}</span> : null}
            {badge ? (
              <span
                className={cn(
                  "font-num ml-auto rounded-[3px] bg-primary/10 px-1.5 py-px text-[10.5px] font-semibold text-primary",
                  collapsed && "absolute right-1 top-0.5 ml-0 px-1",
                )}
              >
                {badge}
              </span>
            ) : null}
          </button>
        );
        return collapsed ? (
          <Tooltip key={item.id}>
            <TooltipTrigger asChild>{button}</TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>
              {item.label}
              {badge ? ` — ${badge} waiting` : ""}
            </TooltipContent>
          </Tooltip>
        ) : (
          <div key={item.id}>{button}</div>
        );
      })}
    </nav>
  );
}

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <TooltipProvider delayDuration={200}>
      <aside
        className={cn(
          "sticky top-0 hidden h-dvh shrink-0 flex-col border-r bg-sidebar transition-[width] duration-150 md:flex",
          collapsed ? "w-14" : "w-52",
        )}
      >
        <div className={cn("flex h-12 items-center border-b px-3", collapsed && "justify-center px-0")}>
          {collapsed ? (
            <span aria-hidden className="font-mono text-[13px] font-bold text-primary">O·</span>
          ) : (
            <span className="font-mono text-[13px] font-semibold tracking-tight text-foreground">
              Outreach<span className="text-primary">OS</span>
            </span>
          )}
          <VisuallyHidden>Outreach OS</VisuallyHidden>
        </div>
        <div className="flex-1 overflow-y-auto scroll-slim">
          <SidebarNav collapsed={collapsed} />
        </div>
        <div className="border-t p-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggle}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={cn("h-8 w-full justify-start gap-2 text-[12.5px] text-sidebar-foreground/70", collapsed && "justify-center")}
          >
            {collapsed ? (
              <PanelLeftOpen aria-hidden className="size-4" />
            ) : (
              <>
                <PanelLeftClose aria-hidden className="size-4" />
                Collapse
              </>
            )}
          </Button>
        </div>
      </aside>
    </TooltipProvider>
  );
}

export function MobileSidebar() {
  const view = useAppStore((s) => s.view);
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="sm" className="size-8 p-0 md:hidden" aria-label="Open navigation">
          <Menu className="size-4.5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-60 bg-sidebar p-0">
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <SheetDescription className="sr-only">
          Switch between the workspace sections.
        </SheetDescription>
        <div className="flex h-12 items-center border-b px-4">
          <span className="font-mono text-[13px] font-semibold tracking-tight">
            Outreach<span className="text-primary">OS</span>
          </span>
        </div>
        <SidebarNav collapsed={false} />
      </SheetContent>
    </Sheet>
  );
}
