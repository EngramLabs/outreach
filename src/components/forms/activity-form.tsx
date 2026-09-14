"use client";

// Log-activity dialog. Shared by prospect drawer, follow-up queue, research
// queue, and activities view. Presets the prospect when opened from context.

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
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { activitiesApi, prospectsApi, qk } from "@/lib/api-client";
import { useAppStore } from "@/state/app-state";
import { ACTIVITY_TYPES, type ActivityType } from "@/lib/constants";
import { format } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function ActivityFormDialog() {
  const activityForm = useAppStore((s) => s.activityForm);
  const closeActivityForm = useAppStore((s) => s.closeActivityForm);
  const queryClient = useQueryClient();

  const [activityType, setActivityType] = useState<ActivityType>("Note");
  const [occurredAt, setOccurredAt] = useState<Date>(new Date());
  const [notes, setNotes] = useState("");
  const [messageText, setMessageText] = useState("");
  const [prospectId, setProspectId] = useState("");
  const [prospectSearch, setProspectSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Prospect picker (only when no preset).
  const { data: prospectOptions } = useQuery({
    queryKey: qk.prospects({ query: prospectSearch, pageSize: 20 }),
    queryFn: () => prospectsApi.list({ query: prospectSearch, pageSize: 20, sort: "name", order: "asc" }),
    enabled: activityForm !== null && activityForm.prospectId === null && prospectSearch.length >= 1,
  });

  const presetProspect = useQuery({
    queryKey: qk.prospect(activityForm?.prospectId ?? ""),
    queryFn: () => prospectsApi.get(activityForm!.prospectId!),
    enabled: activityForm !== null && activityForm.prospectId !== null,
  });

  useEffect(() => {
    if (activityForm) {
      setActivityType("Note");
      setOccurredAt(new Date());
      setNotes("");
      setMessageText("");
      setProspectId(activityForm.prospectId ?? "");
      setProspectSearch("");
      setError(null);
    }
  }, [activityForm]);

  const needsMessage = useMemo(
    () => ["Message Sent", "Follow-Up Sent", "Reply Received", "Email"].includes(activityType),
    [activityType],
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!prospectId) {
      setError("Pick a prospect — every activity attaches to one.");
      return;
    }
    setSaving(true);
    try {
      await activitiesApi.create({
        prospectId,
        activityType,
        occurredAt: occurredAt.toISOString(),
        notes: notes || undefined,
        messageText: messageText || undefined,
      });
      toast({ title: "Activity logged", description: `${activityType} recorded.` });
      await queryClient.invalidateQueries({ queryKey: ["activities"] });
      await queryClient.invalidateQueries({ queryKey: ["prospect"] });
      await queryClient.invalidateQueries({ queryKey: ["prospects"] });
      await queryClient.invalidateQueries({ queryKey: qk.dashboard });
      await queryClient.invalidateQueries({ queryKey: qk.followUps });
      closeActivityForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not log the activity. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={activityForm !== null} onOpenChange={(open) => !open && closeActivityForm()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Log activity</DialogTitle>
          <DialogDescription>
            Recording contact events also updates status and lifecycle dates automatically.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {activityForm?.prospectId ? (
            <div className="space-y-1.5">
              <Label>Prospect</Label>
              <p className="rounded-md border bg-surface-subtle px-3 py-2 text-[13px] font-medium">
                {presetProspect.data
                  ? `${presetProspect.data.firstName} ${presetProspect.data.lastName ?? ""}`.trim()
                  : "Loading…"}
                {presetProspect.data?.companyName ? (
                  <span className="text-muted-foreground"> · {presetProspect.data.companyName}</span>
                ) : null}
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="activity-prospect">Prospect</Label>
              <Input
                id="activity-prospect"
                placeholder="Search by name…"
                value={prospectSearch}
                onChange={(e) => setProspectSearch(e.target.value)}
                autoComplete="off"
              />
              {prospectOptions && prospectOptions.data.length > 0 ? (
                <div className="scroll-slim max-h-44 overflow-y-auto rounded-md border">
                  {prospectOptions.data.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setProspectId(p.id);
                        setProspectSearch("");
                      }}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 border-b px-3 py-2 text-left text-[13px] last:border-0 hover:bg-surface-subtle",
                        prospectId === p.id && "bg-accent",
                      )}
                    >
                      <span className="font-medium">
                        {p.firstName} {p.lastName ?? ""}
                      </span>
                      <span className="truncate text-[12px] text-muted-foreground">
                        {p.jobTitle ?? "—"} · {p.companyName ?? "No company"}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
              {prospectId && !prospectSearch ? (
                <p className="text-[12px] text-success">Prospect selected.</p>
              ) : null}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="activity-type">Type</Label>
              <Select value={activityType} onValueChange={(v) => setActivityType(v as ActivityType)}>
                <SelectTrigger id="activity-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACTIVITY_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-start font-num font-normal"
                  >
                    <CalendarIcon className="size-3.5 text-muted-foreground" aria-hidden />
                    {format(occurredAt, "MMM d, yyyy")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={occurredAt}
                    defaultMonth={occurredAt}
                    onSelect={(d) => d && setOccurredAt(d)}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="activity-notes">
              {needsMessage ? "Message sent" : "Notes"}
            </Label>
            <Textarea
              id="activity-notes"
              rows={4}
              value={needsMessage ? messageText : notes}
              onChange={(e) => (needsMessage ? setMessageText(e.target.value) : setNotes(e.target.value))}
              placeholder={
                needsMessage
                  ? "What did you send? (kept with the activity)"
                  : "Context, outcome, or reminder…"
              }
            />
            {needsMessage ? (
              <div className="space-y-1.5">
                <Label htmlFor="activity-notes-2">Notes (optional)</Label>
                <Textarea
                  id="activity-notes-2"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any extra context…"
                />
              </div>
            ) : null}
          </div>

          {error ? (
            <p role="alert" className="rounded-sm bg-destructive/10 px-2.5 py-2 text-[12.5px] text-destructive">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeActivityForm}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Log activity"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
