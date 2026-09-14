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
import { campaignsApi, qk } from "@/lib/api-client";
import { useAppStore } from "@/state/app-state";
import { CAMPAIGN_STATUSES } from "@/lib/constants";
import { format } from "date-fns";

interface FormState {
  name: string;
  description: string;
  targetAudience: string;
  status: string;
  startDate: string;
  endDate: string;
  notes: string;
}

const EMPTY: FormState = {
  name: "", description: "", targetAudience: "", status: "Draft",
  startDate: "", endDate: "", notes: "",
};

export function CampaignFormDialog() {
  const campaignForm = useAppStore((s) => s.campaignForm);
  const closeCampaignForm = useAppStore((s) => s.closeCampaignForm);
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const isEdit = Boolean(campaignForm?.campaignId);

  const { data: existing } = useQuery({
    queryKey: qk.campaign(campaignForm?.campaignId ?? ""),
    queryFn: () => campaignsApi.get(campaignForm!.campaignId!),
    enabled: isEdit,
  });

  useEffect(() => {
    if (campaignForm === null) return;
    setFormError(null);
    setErrors({});
    if (campaignForm.campaignId && existing) {
      setForm({
        name: existing.name,
        description: (existing.description as string) ?? "",
        targetAudience: (existing.targetAudience as string) ?? "",
        status: (existing.status as string) ?? "Draft",
        startDate: existing.startDate ? format(new Date(existing.startDate as string), "yyyy-MM-dd") : "",
        endDate: existing.endDate ? format(new Date(existing.endDate as string), "yyyy-MM-dd") : "",
        notes: (existing.notes as string) ?? "",
      });
    } else {
      setForm({ ...EMPTY, startDate: format(new Date(), "yyyy-MM-dd") });
    }
  }, [campaignForm, existing]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setFormError(null);
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = "Campaign name is required.";
    if (form.startDate && form.endDate && form.startDate > form.endDate) {
      e.endDate = "End date must be after the start date.";
    }
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    setSaving(true);
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      targetAudience: form.targetAudience.trim() || null,
      status: form.status,
      startDate: form.startDate || null,
      endDate: form.endDate || null,
      notes: form.notes.trim() || null,
    };
    try {
      if (isEdit && campaignForm?.campaignId) {
        await campaignsApi.update(campaignForm.campaignId, payload);
        toast({ title: "Campaign saved", description: `${form.name} was updated.` });
      } else {
        await campaignsApi.create(payload);
        toast({ title: "Campaign created", description: `${form.name} is ready for prospects.` });
      }
      await queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      await queryClient.invalidateQueries({ queryKey: ["campaign"] });
      closeCampaignForm();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not save the campaign. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={campaignForm !== null} onOpenChange={(open) => !open && closeCampaignForm()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit campaign" : "New campaign"}</DialogTitle>
          <DialogDescription>
            Campaigns group related outreach so results can be compared honestly.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="caf-name">
              Name <span aria-hidden className="text-destructive">*</span>
            </Label>
            <Input
              id="caf-name"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              required
              maxLength={200}
              aria-invalid={Boolean(errors.name)}
            />
            {errors.name ? <p role="alert" className="text-[11.5px] font-medium text-destructive">{errors.name}</p> : null}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5 sm:col-span-3">
              <Label htmlFor="caf-audience">Target audience</Label>
              <Input
                id="caf-audience"
                value={form.targetAudience}
                onChange={(e) => set("targetAudience", e.target.value)}
                placeholder="e.g. VPs of Operations at logistics companies (201–500)"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => set("status", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CAMPAIGN_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="caf-start">Start date</Label>
              <Input
                id="caf-start"
                type="date"
                value={form.startDate}
                onChange={(e) => set("startDate", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="caf-end">End date</Label>
              <Input
                id="caf-end"
                type="date"
                value={form.endDate}
                onChange={(e) => set("endDate", e.target.value)}
                aria-invalid={Boolean(errors.endDate)}
              />
              {errors.endDate ? <p role="alert" className="text-[11.5px] font-medium text-destructive">{errors.endDate}</p> : null}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="caf-desc">Description</Label>
            <Textarea
              id="caf-desc"
              rows={2}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="What this campaign is for, and the angle…"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="caf-notes">Notes</Label>
            <Textarea id="caf-notes" rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </div>
          {formError ? (
            <p role="alert" className="rounded-sm bg-destructive/10 px-2.5 py-2 text-[12.5px] text-destructive">
              {formError}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeCampaignForm}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : isEdit ? "Save changes" : "Create campaign"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
