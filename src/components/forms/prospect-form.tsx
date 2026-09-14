"use client";

// Prospect create/edit form. Fields grouped by meaning (spec §22):
// Identity / Contact / Context / Tracking, with secondary notes behind a
// disclosure. Editing loads the record and preserves values on failures.

import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { campaignsApi, companiesApi, prospectsApi, qk } from "@/lib/api-client";
import { useAppStore } from "@/state/app-state";
import {
  PRIORITIES,
  PROSPECT_SOURCES,
  PROSPECT_STATUSES,
  type Priority,
  type ProspectStatus,
} from "@/lib/constants";
import { isValidEmail, isValidLinkedinUrl } from "@/lib/normalize";
import { ChevronsUpDown, Plus, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";

interface FormState {
  firstName: string;
  lastName: string;
  jobTitle: string;
  location: string;
  linkedinUrl: string;
  email: string;
  companyId: string;
  companyName: string; // free-text → create company
  campaignId: string;
  source: string;
  status: ProspectStatus;
  priority: Priority;
  fitScore: string;
  researchNotes: string;
  outreachAngle: string;
  notes: string;
  tags: string;
}

const EMPTY: FormState = {
  firstName: "", lastName: "", jobTitle: "", location: "",
  linkedinUrl: "", email: "", companyId: "", companyName: "",
  campaignId: "", source: "", status: "Researching", priority: "Medium",
  fitScore: "", researchNotes: "", outreachAngle: "", notes: "", tags: "",
};

export function ProspectFormDialog() {
  const prospectForm = useAppStore((s) => s.prospectForm);
  const closeProspectForm = useAppStore((s) => s.closeProspectForm);
  const openProspect = useAppStore((s) => s.openProspect);
  const queryClient = useQueryClient();

  const [form, setForm] = useState<FormState>(EMPTY);
  const [showMore, setShowMore] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [companyOpen, setCompanyOpen] = useState(false);

  const isEdit = Boolean(prospectForm?.prospectId);

  const { data: companies } = useQuery({
    queryKey: qk.companies(),
    queryFn: () => companiesApi.list(),
    enabled: prospectForm !== null,
  });

  const { data: campaigns } = useQuery({
    queryKey: qk.campaigns(),
    queryFn: () => campaignsApi.list({ status: "all" }),
    enabled: prospectForm !== null,
  });

  const { data: existing } = useQuery({
    queryKey: qk.prospect(prospectForm?.prospectId ?? ""),
    queryFn: () => prospectsApi.get(prospectForm!.prospectId!),
    enabled: isEdit,
  });

  useEffect(() => {
    if (prospectForm === null) return;
    setFormError(null);
    setErrors({});
    setSaving(false);
    if (prospectForm.prospectId && existing) {
      setForm({
        firstName: existing.firstName,
        lastName: existing.lastName ?? "",
        jobTitle: existing.jobTitle ?? "",
        location: existing.location ?? "",
        linkedinUrl: existing.linkedinUrl ?? "",
        email: existing.email ?? "",
        companyId: existing.companyId ?? "",
        companyName: "",
        campaignId: existing.campaignId ?? "",
        source: existing.source ?? "",
        status: existing.status as ProspectStatus,
        priority: existing.priority as Priority,
        fitScore: existing.fitScore != null ? String(existing.fitScore) : "",
        researchNotes: existing.researchNotes ?? "",
        outreachAngle: existing.outreachAngle ?? "",
        notes: existing.notes ?? "",
        tags: existing.tags ?? "",
      });
      setShowMore(
        Boolean(existing.researchNotes || existing.outreachAngle || existing.notes || existing.tags),
      );
    } else if (!prospectForm.prospectId) {
      const preset = prospectForm.preset ?? {};
      setForm({
        ...EMPTY,
        campaignId: typeof preset.campaignId === "string" ? preset.campaignId : "",
        status: (typeof preset.status === "string" && !preset.status.includes(",") ? preset.status : "Researching") as ProspectStatus,
      });
      setShowMore(false);
    }
  }, [prospectForm, existing]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const selectedCompany = useMemo(
    () => companies?.data.find((c) => c.id === form.companyId),
    [companies, form.companyId],
  );

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!form.firstName.trim()) {
      e.firstName = "First name is required — check the LinkedIn profile name.";
    }
    if (form.email && !isValidEmail(form.email)) {
      e.email = "Enter a full email like name@company.com, or leave it empty.";
    }
    if (form.linkedinUrl && form.linkedinUrl.length >= 8 && !isValidLinkedinUrl(form.linkedinUrl)) {
      e.linkedinUrl = "Use the full profile URL: https://www.linkedin.com/in/name";
    }
    if (form.fitScore !== "") {
      const n = Number(form.fitScore);
      if (!Number.isInteger(n) || n < 0 || n > 100) {
        e.fitScore = "Fit score is a whole number from 0 to 100.";
      }
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setFormError(null);
    if (!validate()) return;

    const payload: Record<string, unknown> = {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim() || null,
      jobTitle: form.jobTitle.trim() || null,
      location: form.location.trim() || null,
      linkedinUrl: form.linkedinUrl.trim() || null,
      email: form.email.trim() || null,
      companyId: form.companyId || null,
      campaignId: form.campaignId || null,
      source: form.source || null,
      status: form.status,
      priority: form.priority,
      fitScore: form.fitScore === "" ? null : Number(form.fitScore),
      researchNotes: form.researchNotes.trim() || null,
      outreachAngle: form.outreachAngle.trim() || null,
      notes: form.notes.trim() || null,
      tags: form.tags.trim() || null,
    };
    if (!form.companyId && form.companyName.trim()) {
      payload.companyName = form.companyName.trim();
    }

    setSaving(true);
    let formCloseId: string | null = null;
    try {
      if (isEdit && prospectForm?.prospectId) {
        // Don't resend status if unchanged (automation fires on change only).
        if (existing && existing.status === form.status) delete payload.status;
        await prospectsApi.update(prospectForm.prospectId, payload);
        toast({ title: "Prospect saved", description: `${form.firstName}'s record was updated.` });
      } else {
        const created = await prospectsApi.create(payload);
        toast({ title: "Prospect added", description: `${created.firstName} is now in Researching.` });
        formCloseId = created.id;
      }
      await queryClient.invalidateQueries({ queryKey: ["prospects"] });
      await queryClient.invalidateQueries({ queryKey: ["prospect"] });
      await queryClient.invalidateQueries({ queryKey: qk.companies() });
      await queryClient.invalidateQueries({ queryKey: qk.dashboard });
      closeProspectForm();
      if (formCloseId) {
        // Surface the new record immediately.
        openProspect(formCloseId);
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not save the prospect. Try again.");
    } finally {
      setSaving(false);
    }
  }

  const field = (
    key: keyof FormState,
    label: string,
    props: React.InputHTMLAttributes<HTMLInputElement> = {},
    hint?: string,
  ) => (
    <div className="space-y-1.5">
      <Label htmlFor={`pf-${key}`}>
        {label}
        {props.required ? <span aria-hidden className="ml-0.5 text-destructive">*</span> : null}
      </Label>
      <Input
        id={`pf-${key}`}
        value={form[key] as string}
        onChange={(e) => set(key, e.target.value as FormState[typeof key])}
        aria-invalid={Boolean(errors[key])}
        aria-describedby={errors[key] ? `pf-${key}-error` : undefined}
        {...props}
      />
      {hint && !errors[key] ? <p className="text-[11.5px] text-muted-foreground">{hint}</p> : null}
      {errors[key] ? (
        <p id={`pf-${key}-error`} role="alert" className="text-[11.5px] font-medium text-destructive">
          {errors[key]}
        </p>
      ) : null}
    </div>
  );

  return (
    <Dialog open={prospectForm !== null} onOpenChange={(open) => !open && closeProspectForm()}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto scroll-slim">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit prospect" : "Add prospect"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Changes save immediately; status changes also record an auditable activity."
              : "New records start in Researching. Verify details before moving to Ready."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          <fieldset className="space-y-3">
            <legend className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              Identity
            </legend>
            <div className="grid grid-cols-2 gap-3">
              {field("firstName", "First name", { required: true, autoFocus: true, maxLength: 100 })}
              {field("lastName", "Last name", { maxLength: 100 })}
              {field("jobTitle", "Job title", { maxLength: 150 })}
              {field("location", "Location", { maxLength: 120, placeholder: "City, Country" })}
            </div>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              Contact
            </legend>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {field("linkedinUrl", "LinkedIn URL", {
                placeholder: "https://www.linkedin.com/in/name",
                inputMode: "url",
              }, "Profile URL — required before sending connection requests.")}
              {field("email", "Email", { placeholder: "name@company.com", inputMode: "email" })}
            </div>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              Context
            </legend>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Company</Label>
                <Popover open={companyOpen} onOpenChange={setCompanyOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      aria-expanded={companyOpen}
                      className="w-full justify-between font-normal"
                    >
                      <span className="truncate">
                        {selectedCompany
                          ? selectedCompany.name
                          : form.companyName || "No company"}
                      </span>
                      <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[min(28rem,90vw)] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search companies or type a new name…" />
                      <CommandList>
                        <CommandEmpty>
                          {form.companyName ? "Press Enter to create this company" : "No company found."}
                        </CommandEmpty>
                        <CommandGroup heading="Existing companies">
                          {(companies?.data ?? []).map((c) => (
                            <CommandItem
                              key={c.id}
                              value={`${c.name} ${c.industry ?? ""}`}
                              onSelect={() => {
                                set("companyId", c.id);
                                set("companyName", "");
                                setCompanyOpen(false);
                              }}
                            >
                              <Check
                                aria-hidden
                                className={cn("size-3.5", form.companyId === c.id ? "opacity-100" : "opacity-0")}
                              />
                              <span className="truncate">{c.name}</span>
                              <span className="ml-auto text-[11px] text-muted-foreground">
                                {c.prospectCount} prospect{c.prospectCount === 1 ? "" : "s"}
                              </span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                        <CommandGroup heading="New">
                          <CommandItem
                            value={`__create__ ${form.companyName}`}
                            onSelect={() => {
                              if (form.companyName.trim()) {
                                set("companyId", "");
                                setCompanyOpen(false);
                              }
                            }}
                          >
                            <Plus className="size-3.5" aria-hidden />
                            Create new company: “{form.companyName || "…"}”
                          </CommandItem>
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                <Input
                  aria-label="New company name"
                  placeholder="…or type a new company name here"
                  className="h-8 text-[12.5px]"
                  value={form.companyName}
                  onChange={(e) => {
                    set("companyName", e.target.value);
                    if (e.target.value) set("companyId", "");
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Campaign</Label>
                <Select value={form.campaignId || "none"} onValueChange={(v) => set("campaignId", v === "none" ? "" : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="No campaign" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No campaign</SelectItem>
                    {(campaigns?.data ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Source</Label>
                <Select value={form.source || "none"} onValueChange={(v) => set("source", v === "none" ? "" : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pick one" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not set</SelectItem>
                    {PROSPECT_SOURCES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              Tracking
            </legend>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => set("status", v as ProspectStatus)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROSPECT_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Select value={form.priority} onValueChange={(v) => set("priority", v as Priority)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-1.5">
                {field("fitScore", "Fit score (0–100)", { inputMode: "numeric", placeholder: "e.g. 75" })}
              </div>
            </div>
            {!isEdit && form.status !== "Researching" ? (
              <p className="rounded-sm bg-surface-subtle px-2.5 py-2 text-[12px] text-muted-foreground">
                Saving with this status will record the change and fill missing lifecycle dates automatically.
              </p>
            ) : null}
          </fieldset>

          <div className="flex items-center justify-between rounded-md border px-3 py-2.5">
            <div>
              <Label htmlFor="show-more" className="text-[13px] font-medium">
                Research &amp; notes
              </Label>
              <p className="text-[11.5px] text-muted-foreground">
                Research notes, outreach angle, general notes, tags.
              </p>
            </div>
            <Switch id="show-more" checked={showMore} onCheckedChange={setShowMore} />
          </div>

          {showMore ? (
            <div className="grid grid-cols-1 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="pf-research">Research notes</Label>
                <Textarea
                  id="pf-research"
                  rows={2}
                  value={form.researchNotes}
                  onChange={(e) => set("researchNotes", e.target.value)}
                  placeholder="Where you found them, what you noticed…"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pf-angle">Outreach angle</Label>
                <Textarea
                  id="pf-angle"
                  rows={2}
                  value={form.outreachAngle}
                  onChange={(e) => set("outreachAngle", e.target.value)}
                  placeholder="Why them, and how you'll open…"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pf-notes">Notes</Label>
                <Textarea
                  id="pf-notes"
                  rows={2}
                  value={form.notes}
                  onChange={(e) => set("notes", e.target.value)}
                />
              </div>
              {field("tags", "Tags", { placeholder: "comma,separated", maxLength: 500 })}
            </div>
          ) : null}

          {formError ? (
            <p role="alert" className="rounded-sm bg-destructive/10 px-2.5 py-2 text-[12.5px] text-destructive">
              {formError}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeProspectForm}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : isEdit ? "Save changes" : "Add prospect"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
