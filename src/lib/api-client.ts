"use client";

// Typed API client for all backend calls. Every function throws an Error
// with the server's human-readable message on failure.

import type {
  ActivityItem,
  AnalyticsData,
  BulkActionRequest,
  CampaignRow,
  CompanyRow,
  DashboardData,
  DataQualitySummary,
  FollowUpItem,
  ImportPreview,
  ImportResult,
  Paginated,
  ProspectsQuery,
  ProspectDetail,
  ProspectRow,
  SearchResults,
  SessionInfo,
} from "./types";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (res.status === 401) {
    // Session expired — reload to show the login screen.
    window.location.reload();
    throw new Error("Your session expired. Sign in again to continue.");
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new Error(
      (data as { error?: string }).error ?? "The request failed. Try again.",
    );
  }
  return data as T;
}

function qs(params: Record<string, unknown>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const authApi = {
  login: (email: string, password: string) =>
    request<{ ok: boolean }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  logout: () => request<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),
  session: () => request<SessionInfo>("/api/auth/session"),
};

// ---------------------------------------------------------------------------
// Prospects
// ---------------------------------------------------------------------------

export type ProspectListResponse = Paginated<ProspectRow>;

export const prospectsApi = {
  list: (params: ProspectsQuery) =>
    request<ProspectListResponse>(`/api/prospects${qs(params as Record<string, unknown>)}`),
  get: (id: string) => request<ProspectDetail>(`/api/prospects/${id}`),
  create: (data: Record<string, unknown>) =>
    request<ProspectRow>("/api/prospects", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Record<string, unknown>) =>
    request<ProspectRow>(`/api/prospects/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  remove: (id: string) => request<{ ok: boolean }>(`/api/prospects/${id}`, { method: "DELETE" }),
  bulk: (data: BulkActionRequest) =>
    request<{ ok: boolean; [k: string]: unknown }>("/api/prospects/bulk", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  merge: (targetId: string, sourceId: string) =>
    request<{ ok: boolean }>("/api/prospects/merge", {
      method: "POST",
      body: JSON.stringify({ targetId, sourceId }),
    }),
  logActivity: (prospectId: string, data: Record<string, unknown>) =>
    request<{ id: string }>(`/api/prospects/${prospectId}/activities`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  followUpAction: (
    prospectId: string,
    data: { action: string; date?: string | null; notes?: string },
  ) =>
    request<{ ok: boolean; effects: string[] }>(`/api/prospects/${prospectId}/followup`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  verify: (prospectId: string, fields: Record<string, boolean>, notes?: string) =>
    request<{ ok: boolean; verificationStatus: string }>(`/api/prospects/${prospectId}/verify`, {
      method: "POST",
      body: JSON.stringify({ fields, notes }),
    }),
  importPreview: (csv: string, mapping?: Record<string, string>) =>
    request<ImportPreview>("/api/prospects/import", {
      method: "POST",
      body: JSON.stringify({ stage: "preview", csv, mapping }),
    }),
  importCommit: (data: {
    rows: Record<string, string>[];
    mapping: Record<string, string>;
    mode: "create" | "update";
    campaignId?: string | null;
    sourceLabel?: string | null;
  }) =>
    request<ImportResult>("/api/prospects/import", {
      method: "POST",
      body: JSON.stringify({ stage: "commit", ...data }),
    }),
};

// ---------------------------------------------------------------------------
// Companies / Campaigns
// ---------------------------------------------------------------------------

export const companiesApi = {
  list: (params?: { query?: string; status?: string; ids?: string; sort?: string; order?: string }) =>
    request<{ data: CompanyRow[] }>(`/api/companies${qs(params ?? {})}`),
  get: (id: string) => request<Record<string, unknown> & { id: string; name: string }>(`/api/companies/${id}`),
  create: (data: Record<string, unknown>) =>
    request<{ id: string; name: string }>("/api/companies", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Record<string, unknown>) =>
    request<{ id: string }>(`/api/companies/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  remove: (id: string) => request<{ ok: boolean }>(`/api/companies/${id}`, { method: "DELETE" }),
};

export const campaignsApi = {
  list: (params?: { status?: string }) =>
    request<{ data: CampaignRow[] }>(`/api/campaigns${qs(params ?? {})}`),
  get: (id: string) => request<Record<string, unknown> & { id: string; name: string }>(`/api/campaigns/${id}`),
  create: (data: Record<string, unknown>) =>
    request<{ id: string; name: string }>("/api/campaigns", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Record<string, unknown>) =>
    request<{ id: string }>(`/api/campaigns/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  remove: (id: string) => request<{ ok: boolean }>(`/api/campaigns/${id}`, { method: "DELETE" }),
};

// ---------------------------------------------------------------------------
// Activities
// ---------------------------------------------------------------------------

export const activitiesApi = {
  list: (params: {
    type?: string; prospectId?: string; campaignId?: string; companyId?: string;
    from?: string; to?: string; query?: string; page?: number; pageSize?: number;
  }) =>
    request<Paginated<ActivityItem> & { data: ActivityItem[] }>(`/api/activities${qs(params)}`),
  create: (data: Record<string, unknown>) =>
    request<{ id: string }>("/api/activities", { method: "POST", body: JSON.stringify(data) }),
  remove: (id: string) => request<{ ok: boolean }>(`/api/activities/${id}`, { method: "DELETE" }),
};

// ---------------------------------------------------------------------------
// Dashboard / Analytics / Queues / DQ
// ---------------------------------------------------------------------------

export const dashboardApi = {
  get: () => request<DashboardData>("/api/dashboard"),
};

export const analyticsApi = {
  get: (range: string, from?: string, to?: string) =>
    request<AnalyticsData>(`/api/analytics${qs({ range, from, to })}`),
};

export const followUpsApi = {
  queue: () =>
    request<{ items: FollowUpItem[]; counts: Record<string, number> }>("/api/followups"),
};

export const researchApi = {
  queue: (stage: string) =>
    request<{
      data: (ProspectRow & { researchNotes: string | null; outreachAngle: string | null })[];
      counts: { total: number; missingLinkedin: number; missingCompany: number; unverified: number };
    }>(`/api/research${qs({ stage })}`),
};

export const dataQualityApi = {
  get: () => request<DataQualitySummary>("/api/data-quality"),
  action: (action: "dismiss" | "restore" | "reset", key?: string) =>
    request<{ ok: boolean; dismissedCount: number }>("/api/data-quality", {
      method: "POST",
      body: JSON.stringify({ action, key }),
    }),
};

export const searchApi = {
  search: (q: string) => request<SearchResults>(`/api/search${qs({ q })}`),
};

// ---------------------------------------------------------------------------
// Settings / Views / Archive
// ---------------------------------------------------------------------------

export const settingsApi = {
  get: () =>
    request<{ settings: Record<string, string>; operator: { email: string; name: string } }>(
      "/api/settings",
    ),
  update: (data: Record<string, unknown>) =>
    request<{ ok: boolean }>("/api/settings", { method: "PATCH", body: JSON.stringify(data) }),
};

export interface SavedViewItem {
  id: string;
  name: string;
  entityType: string;
  filters: Record<string, unknown>;
  createdAt: string;
}

export const viewsApi = {
  list: () => request<{ data: SavedViewItem[] }>("/api/views"),
  save: (name: string, filters: Record<string, unknown>) =>
    request<{ id: string; name: string; updated?: boolean }>("/api/views", {
      method: "POST",
      body: JSON.stringify({ name, filters }),
    }),
  remove: (id: string) => request<{ ok: boolean }>(`/api/views?id=${encodeURIComponent(id)}`, { method: "DELETE" }),
};

export const archiveApi = {
  list: (page?: number, query?: string) =>
    request<Paginated<ProspectRow>>(`/api/archive${qs({ page, query })}`),
};

// ---------------------------------------------------------------------------
// Query keys (consistent cache invalidation across views)
// ---------------------------------------------------------------------------

export const qk = {
  prospects: (params: ProspectsQuery) => ["prospects", params] as const,
  prospect: (id: string) => ["prospect", id] as const,
  companies: (params?: Record<string, unknown>) => ["companies", params ?? {}] as const,
  company: (id: string) => ["company", id] as const,
  campaigns: (params?: Record<string, unknown>) => ["campaigns", params ?? {}] as const,
  campaign: (id: string) => ["campaign", id] as const,
  activities: (params: Record<string, unknown>) => ["activities", params] as const,
  dashboard: ["dashboard"] as const,
  analytics: (range: string, from?: string, to?: string) => ["analytics", range, from, to] as const,
  followUps: ["followups"] as const,
  research: (stage: string) => ["research", stage] as const,
  dataQuality: ["data-quality"] as const,
  search: (q: string) => ["search", q] as const,
  settings: ["settings"] as const,
  views: ["saved-views"] as const,
  archive: (page: number, query?: string) => ["archive", page, query ?? ""] as const,
};
