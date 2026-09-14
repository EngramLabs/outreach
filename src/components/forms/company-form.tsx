"use client";

import { useEffect, useState } from "react";
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
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { companiesApi, qk } from "@/lib/api-client";
import { useAppStore } from "@/state/app-state";
import { COMPANY_SIZES, COMPANY_STATUSES, PROSPECT_SOURCES } from "@/lib/constants";
import { isValidUrl } from "@/lib/normalize";

interface FormState {
  name: string;
  website: string;
  linkedinUrl: string;
  industry: string;
  location: string;
  companySize: string;
  source: string;
  status: string;
  notes: string;
  tags: string;
}

const EMPTY: FormState = {
  name: "", website: "", linkedinUrl: "", industry: "", location: "",
  companySize: "", source: "", status: "Active", notes: "", tags: "",
};

export function CompanyFormDialog() {
  const companyForm = useAppStore((s) => s.companyForm);
  const closeCompanyForm = useAppStore((s) => s.closeCompanyForm);
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const isEdit = Boolean(companyForm?.companyId);

  const { data: existing } = useQuery({
    queryKey: qk.company(companyForm?.companyId ?? ""),
    queryFn: () => companiesApi.get(companyForm!.companyId!),
    enabled: isEdit,
  });

  useEffect(() => {
    if (companyForm === null) return;
    setFormError(null);
    setErrors({});
    if (companyForm.companyId && existing) {
      setForm({
        name: existing.name,
        website: (existing.website as string) ?? "",
        linkedinUrl: (existing.linkedinUrl as string) ?? "",
        industry: (existing.industry as string) ?? "",
        location: (existing.location as string) ?? "",
        companySize: (existing.companySize as string) ?? "",
        source: (existing.source as string) ?? "",
        status: (existing.status as string) ?? "Active",
        notes: (existing.notes as string) ?? "",
        tags: (existing.tags as string) ?? "",
      });
    } else {
      setForm(EMPTY);
    }
  }, [companyForm, existing]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = "Company name is required.";
    if (form.website && !isValidUrl(form.website)) {
      e.website = "Use the full URL, e.g. https://www.company.com";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setFormError(null);
    if (!validate()) return;
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      website: form.website.trim() || null,
      linkedinUrl: form.linkedinUrl.trim() || null,
      industry: form.industry.trim() || null,
      location: form.location.trim() || null,
      companySize: form.companySize || null,
      source: form.source || null,
      status: form.status,
      notes: form.notes.trim() || null,
      tags: form.tags.trim() || null,
    };
    try {
      if (isEdit && companyForm?.companyId) {
        await companiesApi.update(companyForm.companyId, payload);
        toast({ title: "Company saved", description: `${form.name} was updated.` });
      } else {
        await companiesApi.create(payload);
        toast({ title: "Company added", description: `${form.name} is in your list.` });
      }
      await queryClient.invalidateQueries({ queryKey: ["companies"] });
      await queryClient.invalidateQueries({ queryKey: ["company"] });
      closeCompanyForm();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not save the company. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={companyForm !== null} onOpenChange={(open) => !open && closeCompanyForm()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit company" : "Add company"}</DialogTitle>
          <DialogDescription>
            Duplicate names are detected on save — capitalization and legal suffixes are ignored.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="cf-name">
                Name <span aria-hidden className="text-destructive">*</span>
              </Label>
              <Input
                id="cf-name"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                aria-invalid={Boolean(errors.name)}
                required
                maxLength={200}
              />
              {errors.name ? <p role="alert" className="text-[11.5px] font-medium text-destructive">{errors.name}</p> : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cf-website">Website</Label>
              <Input
                id="cf-website"
                value={form.website}
                onChange={(e) => set("website", e.target.value)}
                placeholder="https://www.company.com"
                inputMode="url"
                aria-invalid={Boolean(errors.website)}
              />
              {errors.website ? <p role="alert" className="text-[11.5px] font-medium text-destructive">{errors.website}</p> : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cf-li">LinkedIn page</Label>
              <Input
                id="cf-li"
                value={form.linkedinUrl}
                onChange={(e) => set("linkedinUrl", e.target.value)}
                placeholder="https://www.linkedin.com/company/name"
                inputMode="url"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cf-industry">Industry</Label>
              <Input id="cf-industry" value={form.industry} onChange={(e) => set("industry", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cf-location">Location</Label>
              <Input
                id="cf-location"
                value={form.location}
                onChange={(e) => set("location", e.target.value)}
                placeholder="City, Country"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Company size</Label>
              <Select value={form.companySize || "none"} onValueChange={(v) => set("companySize", v === "none" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Not set" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not set</SelectItem>
                  {COMPANY_SIZES.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Source</Label>
              <Select value={form.source || "none"} onValueChange={(v) => set("source", v === "none" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Not set" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not set</SelectItem>
                  {PROSPECT_SOURCES.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {isEdit ? (
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => set("status", v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COMPANY_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cf-notes">Notes</Label>
            <Textarea id="cf-notes" rows={3} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cf-tags">Tags</Label>
            <Input
              id="cf-tags"
              value={form.tags}
              onChange={(e) => set("tags", e.target.value)}
              placeholder="comma,separated"
            />
          </div>
          {formError ? (
            <p role="alert" className="rounded-sm bg-destructive/10 px-2.5 py-2 text-[12.5px] text-destructive">
              {formError}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeCompanyForm}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : isEdit ? "Save changes" : "Add company"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
