"use client";

// Field-level verification (spec §18): explicit per-field confirmations,
// never inferred from imports. Writes a Verification activity.

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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { prospectsApi, qk } from "@/lib/api-client";
import { useAppStore } from "@/state/app-state";
import { VERIFIABLE_FIELDS } from "@/lib/constants";

const FIELD_LABELS: Record<string, string> = {
  name: "Name",
  jobTitle: "Job title",
  company: "Company",
  linkedinUrl: "LinkedIn URL",
  email: "Email",
  location: "Location",
};

export function VerifyFormDialog() {
  const verifyForm = useAppStore((s) => s.verifyForm);
  const closeVerifyForm = useAppStore((s) => s.closeVerifyForm);
  const queryClient = useQueryClient();
  const [fields, setFields] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: prospect } = useQuery({
    queryKey: qk.prospect(verifyForm?.prospectId ?? ""),
    queryFn: () => prospectsApi.get(verifyForm!.prospectId),
    enabled: verifyForm !== null,
  });

  useEffect(() => {
    if (verifyForm && prospect) {
      let initial: Record<string, boolean> = {};
      try {
        initial = prospect.verifiedFields ? JSON.parse(prospect.verifiedFields) : {};
      } catch {
        initial = {};
      }
      const next: Record<string, boolean> = {};
      for (const f of VERIFIABLE_FIELDS) next[f] = Boolean(initial[f]);
      setFields(next);
      setNotes(prospect.verificationNotes ?? "");
      setError(null);
    }
  }, [verifyForm, prospect]);

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!verifyForm) return;
    setSaving(true);
    setError(null);
    try {
      const result = await prospectsApi.verify(verifyForm.prospectId, fields, notes || undefined);
      toast({
        title: "Verification saved",
        description: `This record is now ${result.verificationStatus}.`,
      });
      await queryClient.invalidateQueries({ queryKey: ["prospect"] });
      await queryClient.invalidateQueries({ queryKey: ["prospects"] });
      await queryClient.invalidateQueries({ queryKey: qk.research("") });
      await queryClient.invalidateQueries({ queryKey: qk.dashboard });
      closeVerifyForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the verification. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={verifyForm !== null} onOpenChange={(open) => !open && closeVerifyForm()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Verify record fields</DialogTitle>
          <DialogDescription>
            Tick only what you confirmed at the source (LinkedIn, company site). A record
            becomes Verified when every field is checked.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <fieldset className="space-y-1">
            <legend className="sr-only">Verified fields</legend>
            {VERIFIABLE_FIELDS.map((f) => (
              <label
                key={f}
                htmlFor={`vf-${f}`}
                className="flex cursor-pointer items-center justify-between rounded-sm px-2 py-1.5 hover:bg-surface-subtle"
              >
                <span className="text-[13px]">{FIELD_LABELS[f]}</span>
                <Checkbox
                  id={`vf-${f}`}
                  checked={Boolean(fields[f])}
                  onCheckedChange={(v) => setFields((prev) => ({ ...prev, [f]: v === true }))}
                />
              </label>
            ))}
          </fieldset>
          <div className="space-y-1.5">
            <Label htmlFor="vf-notes">Verification notes</Label>
            <Textarea
              id="vf-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="How/where you verified, or what's still uncertain…"
            />
          </div>
          {error ? (
            <p role="alert" className="rounded-sm bg-destructive/10 px-2.5 py-2 text-[12.5px] text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeVerifyForm}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save verification"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
