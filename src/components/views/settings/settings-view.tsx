"use client";

// Settings — operator preferences, data ownership and honest limits.
// Everything here is real: every export row hits a live endpoint, the
// preferences form writes to /api/settings, maintenance resets real
// dismissals. No fake toggles, no danger-zone theater.

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Download } from "lucide-react";
import { dataQualityApi, qk, settingsApi } from "@/lib/api-client";
import { useAppStore } from "@/state/app-state";
import { toast } from "@/hooks/use-toast";
import { isValidUrl } from "@/lib/normalize";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ErrorState, SectionHeader } from "@/components/shared/states";

type SettingsData = Awaited<ReturnType<typeof settingsApi.get>>;

interface PrefsForm {
  defaultFollowUpDays: string;
  weeklyConnectionTarget: string;
  linkedinChecklistUrl: string;
}

function prefsFrom(data: SettingsData): PrefsForm {
  return {
    defaultFollowUpDays: data.settings.defaultFollowUpDays ?? "3",
    weeklyConnectionTarget: data.settings.weeklyConnectionTarget ?? "40",
    linkedinChecklistUrl: data.settings.linkedinChecklistUrl ?? "",
  };
}

const EXPORTS = [
  {
    label: "Prospects (CSV)",
    href: "/api/export?type=prospects&scope=all",
    description: "Every prospect with status, dates and follow-up counts.",
  },
  {
    label: "Companies (CSV)",
    href: "/api/export?type=companies",
    description: "Companies with industry, size and prospect counts.",
  },
  {
    label: "Campaigns (CSV)",
    href: "/api/export?type=campaigns",
    description: "Campaigns with status, audience and dates.",
  },
  {
    label: "Activities (CSV)",
    href: "/api/export?type=activities",
    description: "The full activity log — types, notes, messages.",
  },
  {
    label: "Full backup (JSON)",
    href: "/api/export?type=backup",
    description:
      "Everything: prospects, companies, campaigns, activities, settings — one JSON file.",
  },
] as const;

function SettingsSkeleton() {
  return (
    <div className="flex max-w-2xl flex-col gap-8" role="status" aria-label="Loading settings">
      {[0, 1, 2, 3, 4].map((i) => (
        <section key={i} className="flex flex-col gap-3" aria-hidden>
          <Skeleton className="h-4 w-36" />
          <div className="divide-y rounded-md border bg-card">
            {Array.from({ length: i === 1 ? 2 : 3 }, (_, r) => (
              <div key={r} className="flex flex-col gap-2 px-4 py-3">
                <Skeleton className="h-3.5 w-40" />
                <Skeleton className="h-8 w-full" />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export function SettingsView() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: qk.settings,
    queryFn: settingsApi.get,
  });

  if (isLoading) {
    return <SettingsSkeleton />;
  }

  if (isError || !data) {
    return (
      <div className="max-w-2xl">
        <ErrorState
          message={error instanceof Error ? error.message : "Could not load your settings."}
          onRetry={() => void refetch()}
        />
      </div>
    );
  }

  return <SettingsContent data={data} />;
}

function SettingsContent({ data }: { data: SettingsData }) {
  const queryClient = useQueryClient();
  const setImportOpen = useAppStore((s) => s.setImportOpen);

  // Initialized from the server once; values then live in local state so a
  // failed save never discards the operator's edits.
  const [form, setForm] = useState<PrefsForm>(() => prefsFrom(data));
  const [baseline, setBaseline] = useState<PrefsForm>(() => prefsFrom(data));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [resetOpen, setResetOpen] = useState(false);

  const saveMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => settingsApi.update(payload),
    onSuccess: () => {
      toast({ title: "Settings saved" });
      setBaseline({ ...form });
      void queryClient.invalidateQueries({ queryKey: qk.settings });
    },
  });

  const resetMutation = useMutation({
    mutationFn: () => dataQualityApi.action("reset"),
    onSuccess: () => {
      toast({
        title: "Dismissed issues restored",
        description: "Re-run a scan from the Data Quality view to re-check.",
      });
      setResetOpen(false);
      void queryClient.invalidateQueries({ queryKey: qk.dataQuality });
    },
    onError: (err: Error) => {
      toast({ title: "Reset failed", description: err.message, variant: "destructive" });
    },
  });

  const operatorName = data.operator.name?.trim() || data.settings.operatorName?.trim() || "—";

  const set = <K extends keyof PrefsForm>(key: K, value: PrefsForm[K]) => {
    setForm((f) => (f ? { ...f, [key]: value } : f));
    setFieldErrors((e) => {
      if (!e[key]) return e;
      const next = { ...e };
      delete next[key];
      return next;
    });
  };

  function validate(f: PrefsForm): Record<string, string> {
    const errs: Record<string, string> = {};
    if (f.defaultFollowUpDays.trim() === "") {
      errs.defaultFollowUpDays = "Enter a number of days (0–60).";
    } else {
      const days = Number(f.defaultFollowUpDays);
      if (!Number.isInteger(days) || days < 0 || days > 60) {
        errs.defaultFollowUpDays = "Enter a whole number between 0 and 60.";
      }
    }
    if (f.weeklyConnectionTarget.trim() === "") {
      errs.weeklyConnectionTarget = "Enter a target (0–500).";
    } else {
      const target = Number(f.weeklyConnectionTarget);
      if (!Number.isInteger(target) || target < 0 || target > 500) {
        errs.weeklyConnectionTarget = "Enter a whole number between 0 and 500.";
      }
    }
    if (f.linkedinChecklistUrl.trim() !== "" && !isValidUrl(f.linkedinChecklistUrl.trim())) {
      errs.linkedinChecklistUrl = "Use the full URL, including https://";
    }
    return errs;
  }

  function handleSave(ev: React.FormEvent) {
    ev.preventDefault();
    const errs = validate(form);
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) return;

    const payload: Record<string, unknown> = {};
    if (form.defaultFollowUpDays.trim() !== baseline.defaultFollowUpDays.trim()) {
      payload.defaultFollowUpDays = Number(form.defaultFollowUpDays);
    }
    if (form.weeklyConnectionTarget.trim() !== baseline.weeklyConnectionTarget.trim()) {
      payload.weeklyConnectionTarget = Number(form.weeklyConnectionTarget);
    }
    if (form.linkedinChecklistUrl.trim() !== baseline.linkedinChecklistUrl.trim()) {
      payload.linkedinChecklistUrl = form.linkedinChecklistUrl.trim();
    }
    if (Object.keys(payload).length === 0) return;
    saveMutation.mutate(payload);
  }

  const dirty =
    form.defaultFollowUpDays.trim() !== baseline.defaultFollowUpDays.trim() ||
    form.weeklyConnectionTarget.trim() !== baseline.weeklyConnectionTarget.trim() ||
    form.linkedinChecklistUrl.trim() !== baseline.linkedinChecklistUrl.trim();

  return (
    <div className="flex max-w-2xl flex-col gap-8">
      {/* Operator */}
      <section className="flex flex-col gap-3">
        <SectionHeader title="Operator" />
        <div className="divide-y rounded-md border bg-card">
          <div className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:items-baseline sm:gap-4">
            <span className="w-52 shrink-0 text-xs font-medium text-muted-foreground">Name</span>
            <span className="text-[13px] text-foreground">{operatorName}</span>
          </div>
          <div className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:items-baseline sm:gap-4">
            <span className="w-52 shrink-0 text-xs font-medium text-muted-foreground">Email</span>
            <span className="font-num text-[13px] text-foreground">{data.operator.email}</span>
          </div>
        </div>
        <p className="text-[12.5px] text-muted-foreground">
          Single-operator workspace. Sign-in is required for every session.
        </p>
      </section>

      {/* Preferences */}
      <section className="flex flex-col gap-3">
        <SectionHeader
          title="Preferences"
          description="Defaults applied when the app schedules or checks your work."
        />
        <form onSubmit={handleSave} noValidate className="rounded-md border bg-card p-4">
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="defaultFollowUpDays">Default follow-up interval (days)</Label>
              <Input
                id="defaultFollowUpDays"
                name="defaultFollowUpDays"
                type="number"
                min={0}
                max={60}
                step={1}
                inputMode="numeric"
                value={form.defaultFollowUpDays}
                onChange={(e) => set("defaultFollowUpDays", e.target.value)}
                aria-invalid={fieldErrors.defaultFollowUpDays ? true : undefined}
                aria-describedby="defaultFollowUpDays-help"
                className="h-9"
              />
              {fieldErrors.defaultFollowUpDays ? (
                <p className="text-xs text-destructive" role="alert">
                  {fieldErrors.defaultFollowUpDays}
                </p>
              ) : (
                <p id="defaultFollowUpDays-help" className="text-xs text-muted-foreground">
                  Used when scheduling follow-ups from queues (applies to new schedules).
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="weeklyConnectionTarget">Weekly connection target</Label>
              <Input
                id="weeklyConnectionTarget"
                name="weeklyConnectionTarget"
                type="number"
                min={0}
                max={500}
                step={1}
                inputMode="numeric"
                value={form.weeklyConnectionTarget}
                onChange={(e) => set("weeklyConnectionTarget", e.target.value)}
                aria-invalid={fieldErrors.weeklyConnectionTarget ? true : undefined}
                aria-describedby="weeklyConnectionTarget-help"
                className="h-9"
              />
              {fieldErrors.weeklyConnectionTarget ? (
                <p className="text-xs text-destructive" role="alert">
                  {fieldErrors.weeklyConnectionTarget}
                </p>
              ) : (
                <p id="weeklyConnectionTarget-help" className="text-xs text-muted-foreground">
                  Your personal weekly request budget — used for self-check, not enforcement.
                </p>
              )}
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="linkedinChecklistUrl">LinkedIn checklist URL</Label>
              <Input
                id="linkedinChecklistUrl"
                name="linkedinChecklistUrl"
                type="url"
                placeholder="https://…"
                value={form.linkedinChecklistUrl}
                onChange={(e) => set("linkedinChecklistUrl", e.target.value)}
                aria-invalid={fieldErrors.linkedinChecklistUrl ? true : undefined}
                aria-describedby="linkedinChecklistUrl-help"
                className="h-9"
              />
              {fieldErrors.linkedinChecklistUrl ? (
                <p className="text-xs text-destructive" role="alert">
                  {fieldErrors.linkedinChecklistUrl}
                </p>
              ) : (
                <p id="linkedinChecklistUrl-help" className="text-xs text-muted-foreground">
                  Optional link you keep open while working (e.g. your own outreach checklist doc).
                </p>
              )}
            </div>
          </div>

          {saveMutation.isError ? (
            <p className="mt-4 text-[13px] text-destructive" role="alert">
              {saveMutation.error instanceof Error
                ? saveMutation.error.message
                : "The save failed."}{" "}
              Your values are kept — adjust and save again.
            </p>
          ) : null}

          <div className="mt-5 flex items-center gap-3">
            <Button type="submit" size="sm" disabled={!dirty || saveMutation.isPending}>
              {saveMutation.isPending ? "Saving…" : "Save preferences"}
            </Button>
            {!dirty ? (
              <span className="text-[12.5px] text-muted-foreground">No unsaved changes.</span>
            ) : null}
          </div>
        </form>
      </section>

      {/* Data & backups */}
      <section className="flex flex-col gap-3">
        <SectionHeader
          title="Data & backups"
          description="Everything the app stores is yours to take out at any time."
        />
        <div className="divide-y rounded-md border bg-card">
          {EXPORTS.map((e) => (
            <a
              key={e.href}
              href={e.href}
              download
              className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-subtle focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
            >
              <Download aria-hidden className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium text-foreground">{e.label}</span>
                <span className="block text-[12.5px] text-muted-foreground">{e.description}</span>
              </span>
            </a>
          ))}
          <div className="flex flex-wrap items-center gap-3 px-4 py-3">
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
              Import prospects (CSV)
            </Button>
            <p className="text-[12.5px] text-muted-foreground">
              Preview and column mapping before anything is written.
            </p>
          </div>
        </div>
        <div className="rounded-md bg-surface-subtle p-4 text-[13px] leading-relaxed text-muted-foreground">
          The database is a single SQLite file (<span className="font-num text-foreground">db/custom.db</span>).
          Copying that file is a complete backup; the JSON export above is a portable,
          human-readable snapshot. No proprietary format.
        </div>
      </section>

      {/* LinkedIn boundaries */}
      <section className="flex flex-col gap-3">
        <SectionHeader
          title="LinkedIn boundaries"
          description="What this tool does and deliberately does not do."
        />
        <div className="rounded-md bg-surface-subtle p-4">
          <ul className="list-disc space-y-1.5 pl-4 text-[13px] leading-relaxed text-muted-foreground">
            <li>This app records what you do on LinkedIn — it never sends requests or messages for you.</li>
            <li>No scraping, no browser automation, no platform rules bent.</li>
            <li>Links open LinkedIn in a new tab; actions there are yours.</li>
          </ul>
        </div>
      </section>

      {/* Maintenance */}
      <section className="flex flex-col gap-3">
        <SectionHeader title="Maintenance" />
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-card px-4 py-3">
          <p className="text-[13px] text-foreground">Reset dismissed data-quality issues</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setResetOpen(true)}
            disabled={resetMutation.isPending}
          >
            {resetMutation.isPending ? "Resetting…" : "Reset dismissed issues"}
          </Button>
        </div>
        <p className="text-[12.5px] text-muted-foreground">
          Run a re-scan from the Data Quality view afterwards.
        </p>
      </section>

      <ConfirmDialog
        open={resetOpen}
        onOpenChange={(open) => {
          if (!resetMutation.isPending) setResetOpen(open);
        }}
        title="Reset dismissed issues?"
        description="Re-shows every issue you dismissed. No records are changed."
        confirmLabel="Reset dismissed"
        onConfirm={() => {
          if (!resetMutation.isPending) resetMutation.mutate();
        }}
      />
    </div>
  );
}
