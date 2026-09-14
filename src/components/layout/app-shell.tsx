"use client";

// Application shell: sidebar + topbar + view area + status bar + global
// overlays (command palette, shared dialogs, prospect drawer, import wizard).

import { useState } from "react";
import { useAppStore } from "@/state/app-state";
import { Sidebar, MobileSidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { StatusBar } from "./status-bar";
import { CommandMenu } from "./command-menu";
import { ActivityFormDialog } from "@/components/forms/activity-form";
import { ProspectFormDialog } from "@/components/forms/prospect-form";
import { CompanyFormDialog } from "@/components/forms/company-form";
import { CampaignFormDialog } from "@/components/forms/campaign-form";
import { VerifyFormDialog } from "@/components/forms/verify-form";
import { MergeDialog } from "@/components/forms/merge-dialog";

// View modules (each replaced with its full implementation per worklog tasks).
import { DashboardView } from "@/components/views/dashboard/dashboard-view";
import { ProspectsView } from "@/components/views/prospects/prospects-view";
import { ProspectDrawerLayer } from "@/components/views/prospects/prospect-drawer";
import { ImportWizard } from "@/components/views/prospects/import-wizard";
import { CompaniesView } from "@/components/views/companies/companies-view";
import { CampaignsView } from "@/components/views/campaigns/campaigns-view";
import { ActivitiesView } from "@/components/views/activities/activities-view";
import { FollowUpsView } from "@/components/views/followups/followups-view";
import { ResearchView } from "@/components/views/research/research-view";
import { AnalyticsView } from "@/components/views/analytics/analytics-view";
import { DataQualityView } from "@/components/views/data-quality/data-quality-view";
import { ArchiveView } from "@/components/views/archive/archive-view";
import { SettingsView } from "@/components/views/settings/settings-view";

const VIEWS = {
  dashboard: DashboardView,
  prospects: ProspectsView,
  companies: CompaniesView,
  campaigns: CampaignsView,
  activities: ActivitiesView,
  followups: FollowUpsView,
  research: ResearchView,
  analytics: AnalyticsView,
  "data-quality": DataQualityView,
  archive: ArchiveView,
  settings: SettingsView,
} as const;

export function AppShell({ userName }: { userName: string }) {
  const [collapsed, setCollapsed] = useState(false);
  const view = useAppStore((s) => s.view);
  const View = VIEWS[view];

  return (
    <div className="flex min-h-dvh">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-1.5 focus:text-[13px] focus:text-primary-foreground"
      >
        Skip to content
      </a>
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      <div className="flex min-h-dvh min-w-0 flex-1 flex-col">
        <Topbar userName={userName} />
        <main id="main-content" className="mx-auto w-full max-w-[1440px] flex-1 px-3 py-4 sm:px-5 sm:py-5">
          <View />
        </main>
        <StatusBar />
      </div>

      {/* Global overlays */}
      <CommandMenu />
      <ActivityFormDialog />
      <ProspectFormDialog />
      <CompanyFormDialog />
      <CampaignFormDialog />
      <VerifyFormDialog />
      <MergeDialog />
      <ProspectDrawerLayer />
      <ImportWizard />
    </div>
  );
}
