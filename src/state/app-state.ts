"use client";

// Global UI state: view switching, drawers, shared dialogs.
// All cross-view navigation flows through this store (the app is a single
// route — views are components, not pages).

import { create } from "zustand";
import type { ProspectsQuery } from "@/lib/types";

export type ViewId =
  | "dashboard"
  | "prospects"
  | "companies"
  | "campaigns"
  | "activities"
  | "followups"
  | "research"
  | "analytics"
  | "data-quality"
  | "archive"
  | "settings";

export const VIEW_LABELS: Record<ViewId, string> = {
  dashboard: "Dashboard",
  prospects: "Prospects",
  companies: "Companies",
  campaigns: "Campaigns",
  activities: "Activities",
  followups: "Follow-Up Queue",
  research: "Research Queue",
  analytics: "Analytics",
  "data-quality": "Data Quality",
  archive: "Archive",
  settings: "Settings",
};

interface AppStore {
  view: ViewId;
  /** Pre-applied prospect filters when navigating from another view (DQ fixes, campaign drilldowns…) */
  prospectPreset: Partial<ProspectsQuery> | null;
  setView: (view: ViewId, preset?: Partial<ProspectsQuery>) => void;

  // Prospect drawer (global, mounted once in the shell)
  prospectDrawerId: string | null;
  openProspect: (id: string) => void;
  closeProspect: () => void;

  // Command palette
  commandOpen: boolean;
  setCommandOpen: (open: boolean) => void;

  // Shared dialogs: null = closed
  prospectForm: { prospectId: string | null; preset?: Partial<ProspectsQuery> } | null;
  openProspectForm: (prospectId?: string | null, preset?: Partial<ProspectsQuery>) => void;
  closeProspectForm: () => void;

  companyForm: { companyId: string | null } | null;
  openCompanyForm: (companyId?: string | null) => void;
  closeCompanyForm: () => void;

  campaignForm: { campaignId: string | null } | null;
  openCampaignForm: (campaignId?: string | null) => void;
  closeCampaignForm: () => void;

  activityForm: { prospectId: string | null } | null;
  openActivityForm: (prospectId?: string | null) => void;
  closeActivityForm: () => void;

  verifyForm: { prospectId: string } | null;
  openVerifyForm: (prospectId: string) => void;
  closeVerifyForm: () => void;

  mergeForm: { ids: string[] } | null;
  openMergeForm: (ids: string[]) => void;
  closeMergeForm: () => void;

  // Import wizard
  importOpen: boolean;
  setImportOpen: (open: boolean) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  view: "dashboard",
  prospectPreset: null,
  setView: (view, preset) =>
    set({ view, prospectPreset: preset ?? null, commandOpen: false }),

  prospectDrawerId: null,
  openProspect: (id) => set({ prospectDrawerId: id, commandOpen: false }),
  closeProspect: () => set({ prospectDrawerId: null }),

  commandOpen: false,
  setCommandOpen: (open) => set({ commandOpen: open }),

  prospectForm: null,
  openProspectForm: (prospectId = null, preset) =>
    set({ prospectForm: { prospectId, preset }, commandOpen: false }),
  closeProspectForm: () => set({ prospectForm: null }),

  companyForm: null,
  openCompanyForm: (companyId = null) => set({ companyForm: { companyId } }),
  closeCompanyForm: () => set({ companyForm: null }),

  campaignForm: null,
  openCampaignForm: (campaignId = null) => set({ campaignForm: { campaignId } }),
  closeCampaignForm: () => set({ campaignForm: null }),

  activityForm: null,
  openActivityForm: (prospectId = null) => set({ activityForm: { prospectId } }),
  closeActivityForm: () => set({ activityForm: null }),

  verifyForm: null,
  openVerifyForm: (prospectId) => set({ verifyForm: { prospectId } }),
  closeVerifyForm: () => set({ verifyForm: null }),

  mergeForm: null,
  openMergeForm: (ids) => set({ mergeForm: { ids } }),
  closeMergeForm: () => set({ mergeForm: null }),

  importOpen: false,
  setImportOpen: (open) => set({ importOpen: open, commandOpen: false }),
}));
