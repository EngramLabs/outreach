"use client";

// CSV import wizard (spec §23): source → preview & mapping → options →
// result. Every number shown comes from the server's preview/commit — no
// optimistic guesses. Failure paths explain what went wrong and how to fix.

import { useMemo, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { campaignsApi, prospectsApi, qk } from "@/lib/api-client";
import type { ImportPreview, ImportPreviewRow, ImportResult } from "@/lib/types";
import { parseCsv } from "@/lib/csv";
import { isValidLinkedinUrl } from "@/lib/normalize";
import { useAppStore } from "@/state/app-state";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { ErrorState } from "@/components/shared/states";
import { FileText, Link2, Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Step = 1 | 2 | 3 | 4;

/** Discriminated result of the client-side CSV parse. */
type ParsedCsv = { ok: true; table: string[][] } | { ok: false; error: string };

const SKIP = "__skip__";

const STEP_TITLES: Record<Step, string> = {
  1: "Import prospects — pick the source",
  2: "Check the data & map columns",
  3: "Options & confirm",
  4: "Import result",
};

const STEP_DESCRIPTIONS: Record<Step, string> = {
  1: "Read a CSV of leads — a LinkedIn export or a simple spreadsheet both work. Nothing is saved yet.",
  2: "Pick what each column means, then check which rows will import cleanly.",
  3: "Choose what happens with rows that already exist, then confirm the run.",
  4: "Summary of what was imported.",
};

function fnvHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** Client-side mirror of the server's mapping logic (for preview rendering). */
function mapRowValues(
  values: Record<string, string>,
  mapping: Record<string, string>,
  headers: string[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const h of headers) {
    const field = mapping[h];
    if (field && values[h] !== "") out[field] = values[h];
  }
  if (out.fullName && !out.firstName) {
    const parts = out.fullName.trim().split(/\s+/);
    out.firstName = parts[0] ?? "";
    if (parts.length > 1) out.lastName = parts.slice(1).join(" ");
  }
  return out;
}

function nonDuplicateErrors(row: ImportPreviewRow): string[] {
  return row.errors.filter((e) => !e.includes("already exists"));
}

export function ImportWizard() {
  const queryClient = useQueryClient();
  const importOpen = useAppStore((s) => s.importOpen);
  const setImportOpen = useAppStore((s) => s.setImportOpen);
  const setView = useAppStore((s) => s.setView);

  const [step, setStep] = useState<Step>(1);
  const [fileText, setFileText] = useState("");
  const [fileName, setFileName] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [sourceError, setSourceError] = useState<string | null>(null);
  // Local mapping OVERRIDES on top of the server's suggestion — the preview
  // endpoint merges both and returns the effective mapping.
  const [mappingOverrides, setMappingOverrides] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<"create" | "update">("create");
  const [campaignId, setCampaignId] = useState("");
  const [sourceLabel, setSourceLabel] = useState("CSV Import");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [commitError, setCommitError] = useState<string | null>(null);

  function resetWizard() {
    setStep(1);
    setFileText("");
    setFileName("");
    setPasteText("");
    setSourceError(null);
    setMappingOverrides({});
    setMode("create");
    setCampaignId("");
    setSourceLabel("CSV Import");
    setResult(null);
    setCommitError(null);
  }

  // Every close path resets, so the wizard always opens fresh.
  function closeWizard() {
    resetWizard();
    setImportOpen(false);
  }

  const effectiveCsv = fileText || pasteText;

  // Client-side parse (same parser as the server) for source estimates and
  // full row data on commit.
  const parsed = useMemo<ParsedCsv | null>(() => {
    if (!effectiveCsv.trim()) return null;
    const table = parseCsv(effectiveCsv);
    if (table.length < 2) {
      return { ok: false, error: "The file needs a header row and at least one data row." };
    }
    return { ok: true, table };
  }, [effectiveCsv]);

  const headers = useMemo(
    () => (parsed && parsed.ok ? parsed.table[0].map((h, i) => h.trim() || `Column ${i + 1}`) : []),
    [parsed],
  );
  const rowValues = useMemo(() => {
    if (!parsed || !parsed.ok) return [];
    return parsed.table.slice(1).map((raw) => {
      const v: Record<string, string> = {};
      headers.forEach((h, i) => {
        v[h] = (raw[i] ?? "").trim();
      });
      return v;
    });
  }, [parsed, headers]);

  const csvId = useMemo(() => (effectiveCsv ? `${effectiveCsv.length}-${fnvHash(effectiveCsv)}` : ""), [effectiveCsv]);

  // --- Step 1: file reading ----------------------------------------------
  function handleFile(file: File | undefined) {
    if (!file) return;
    setSourceError(null);
    if (file.size > 5_000_000) {
      setSourceError("That file is too large — the limit is about 5 MB of CSV. Split it into parts.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      if (!text.trim()) {
        setSourceError(`“${file.name}” appears to be empty. Pick a file with a header row and at least one lead.`);
        setFileText("");
        setFileName("");
        return;
      }
      setFileText(text);
      setFileName(file.name);
      setPasteText("");
    };
    reader.onerror = () => {
      setSourceError("The file could not be read. Try selecting it again.");
    };
    reader.readAsText(file);
  }

  function continueFromSource() {
    if (!effectiveCsv.trim()) {
      setSourceError("Choose a file or paste CSV text first.");
      return;
    }
    if (parsed && !parsed.ok) {
      setSourceError(parsed.error);
      return;
    }
    setSourceError(null);
    setStep(2);
  }

  // --- Step 2: preview & mapping ------------------------------------------
  const previewQuery = useQuery({
    queryKey: ["import-preview", csvId, mappingOverrides],
    queryFn: () => prospectsApi.importPreview(effectiveCsv, mappingOverrides),
    enabled: step >= 2 && Boolean(effectiveCsv),
    placeholderData: keepPreviousData,
  });
  const preview = previewQuery.data;
  // Effective mapping = server suggestion + local overrides (what the server
  // actually uses on both preview and commit).
  const effectiveMapping = preview?.mapping ?? {};

  const firstNameMapped =
    Object.values(effectiveMapping).includes("firstName") ||
    Object.values(effectiveMapping).includes("fullName");

  const statusByIndex = useMemo(() => {
    const m = new Map<number, ImportPreviewRow>();
    preview?.rows.forEach((r) => m.set(r.index, r));
    return m;
  }, [preview]);

  // --- Step 3/4: commit ----------------------------------------------------
  const { data: campaignsRes } = useQuery({
    queryKey: qk.campaigns({ status: "all" }),
    queryFn: () => campaignsApi.list({ status: "all" }),
    enabled: importOpen,
  });
  const campaigns = campaignsRes?.data ?? [];

  const commitRowObjects = useMemo(() => {
    if (!preview) return [];
    return rowValues.filter((_, i) => {
      const status = statusByIndex.get(i);
      if (!status) return true; // beyond the 500-row preview — server validates
      const bad = nonDuplicateErrors(status).length > 0;
      if (bad) return false;
      if (mode === "create") return !status.duplicateLinkedin && !status.duplicateEmail;
      return true; // update mode: valid rows + matched duplicates
    });
  }, [preview, rowValues, statusByIndex, mode]);

  const commitMutation = useMutation({
    mutationFn: () =>
      prospectsApi.importCommit({
        rows: commitRowObjects,
        mapping: effectiveMapping,
        mode,
        campaignId: campaignId || null,
        sourceLabel: sourceLabel.trim() || null,
      }),
    onSuccess: (res) => {
      setResult(res);
      setCommitError(null);
      setStep(4);
      toast({
        title: "Import finished",
        description: `${res.created} created · ${res.updated} updated · ${res.skipped} skipped.`,
      });
      void queryClient.invalidateQueries({ queryKey: ["prospects"] });
      void queryClient.invalidateQueries({ queryKey: qk.companies() });
      void queryClient.invalidateQueries({ queryKey: qk.dashboard });
    },
    onError: (err) => {
      setCommitError(err instanceof Error ? err.message : "The import failed. Nothing was saved — try again.");
    },
  });

  // --- Count summaries -----------------------------------------------------
  const validRowCount = preview?.rows.filter((r) => r.errors.length === 0).length ?? 0;
  const duplicateRowCount =
    preview?.rows.filter(
      (r) => (r.duplicateLinkedin || r.duplicateEmail) && nonDuplicateErrors(r).length === 0,
    ).length ?? 0;
  const badRowCount = preview?.rows.filter((r) => nonDuplicateErrors(r).length > 0).length ?? 0;
  const beyondPreviewCount = preview ? Math.max(0, rowValues.length - preview.rows.length) : 0;

  // --- Render --------------------------------------------------------------
  return (
    <Dialog
      open={importOpen}
      onOpenChange={(open) => {
        if (!open) closeWizard();
      }}
    >
      <DialogContent className="flex max-h-[92vh] w-[min(56rem,96vw)] flex-col gap-0 p-0">
        <DialogHeader className="space-y-1 border-b p-4">
          <div className="flex items-baseline justify-between gap-3">
            <DialogTitle className="text-base font-semibold">{STEP_TITLES[step]}</DialogTitle>
            <p className="font-num shrink-0 text-[11.5px] text-muted-foreground">Step {step} of 4</p>
          </div>
          <DialogDescription className="text-[13px] leading-relaxed">
            {STEP_DESCRIPTIONS[step]}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto scroll-slim p-4">
          {step === 1 ? (
            <SourceStep
              fileText={fileText}
              fileName={fileName}
              pasteText={pasteText}
              parsed={parsed}
              rowCount={rowValues.length}
              sourceError={sourceError}
              onFile={handleFile}
              onRemoveFile={() => {
                setFileText("");
                setFileName("");
              }}
              onPaste={setPasteText}
            />
          ) : null}

          {step === 2 ? (
            <MappingStep
              previewQueryPending={previewQuery.isPending}
              previewQueryError={previewQuery.error}
              onRetryPreview={() => void previewQuery.refetch()}
              preview={preview}
              mapping={effectiveMapping}
              onMappingChange={(header, field) =>
                setMappingOverrides((m) => ({ ...m, [header]: field }))
              }
              firstNameMapped={firstNameMapped}
            />
          ) : null}

          {step === 3 ? (
            <OptionsStep
              mode={mode}
              onModeChange={setMode}
              campaigns={campaigns.map((c) => ({ id: c.id, name: c.name }))}
              campaignId={campaignId}
              onCampaignChange={setCampaignId}
              sourceLabel={sourceLabel}
              onSourceLabelChange={setSourceLabel}
              validRowCount={validRowCount}
              duplicateRowCount={duplicateRowCount}
              badRowCount={badRowCount}
              beyondPreviewCount={beyondPreviewCount}
              commitCount={commitRowObjects.length}
              commitError={commitError}
            />
          ) : null}

          {step === 4 && result ? <ResultStep result={result} /> : null}
        </div>

        <DialogFooter className="flex-row justify-between gap-2 border-t p-3">
          <div>
            {step === 1 ? (
              <Button variant="outline" size="sm" onClick={closeWizard}>
                Cancel
              </Button>
            ) : null}
            {step === 2 || step === 3 ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStep((s) => (s - 1) as Step)}
                disabled={commitMutation.isPending}
              >
                Back
              </Button>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {step === 1 ? (
              <Button size="sm" onClick={continueFromSource}>
                Continue
              </Button>
            ) : null}
            {step === 2 ? (
              <Button
                size="sm"
                disabled={!firstNameMapped || previewQuery.isPending || previewQuery.isError || !preview}
                onClick={() => {
                  setCommitError(null);
                  setStep(3);
                }}
              >
                Continue
              </Button>
            ) : null}
            {step === 3 ? (
              <Button
                size="sm"
                disabled={commitRowObjects.length === 0 || commitMutation.isPending}
                onClick={() => commitMutation.mutate()}
              >
                {commitMutation.isPending
                  ? "Importing…"
                  : `Import ${commitRowObjects.length} row${commitRowObjects.length === 1 ? "" : "s"}`}
              </Button>
            ) : null}
            {step === 4 ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    resetWizard();
                  }}
                >
                  Import another
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    setView("prospects");
                    closeWizard();
                  }}
                >
                  Go to prospects
                </Button>
              </>
            ) : null}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Step 1 — source
// ---------------------------------------------------------------------------

function SourceStep({
  fileText,
  fileName,
  pasteText,
  parsed,
  rowCount,
  sourceError,
  onFile,
  onRemoveFile,
  onPaste,
}: {
  fileText: string;
  fileName: string;
  pasteText: string;
  parsed: ParsedCsv | null;
  rowCount: number;
  sourceError: string | null;
  onFile: (file: File | undefined) => void;
  onRemoveFile: () => void;
  onPaste: (text: string) => void;
}) {
  const hasFile = Boolean(fileText);
  const parsedTable = parsed && parsed.ok ? parsed.table : null;
  const parseError = parsed && !parsed.ok ? parsed.error : null;
  const kb = fileText ? (fileText.length / 1024).toFixed(1) : "";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-md border bg-surface-subtle px-3 py-2.5">
        <Upload aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-foreground">Upload a CSV file</p>
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            Up to about 5 MB (≈ 2,000 rows). The first row must contain column headers.
          </p>
        </div>
        <label htmlFor="import-file" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-8 cursor-pointer text-[13px]")}>
          {hasFile ? "Replace file" : "Choose file"}
        </label>
        <input
          id="import-file"
          type="file"
          accept=".csv,.txt"
          className="sr-only"
          onChange={(e) => {
            onFile(e.target.files?.[0]);
            e.target.value = ""; // allow re-picking the same file
          }}
        />
      </div>

      {hasFile && parsedTable ? (
        <div
          className="inline-flex max-w-full items-center gap-2 rounded-sm border bg-card px-2.5 py-1.5 text-[12.5px] text-muted-foreground"
          role="status"
        >
          <FileText aria-hidden className="size-3.5 shrink-0" />
          <span className="truncate font-medium text-foreground">{fileName}</span>
          <span className="font-num shrink-0">
            {kb} KB · {rowCount} rows · {parsedTable[0].length} columns
          </span>
          <button
            type="button"
            onClick={onRemoveFile}
            aria-label="Remove file"
            className="shrink-0 rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
          >
            <X aria-hidden className="size-3.5" />
          </button>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="import-paste" className="text-[13px]">
          …or paste CSV text
        </Label>
        <Textarea
          id="import-paste"
          rows={7}
          value={pasteText}
          disabled={hasFile}
          onChange={(e) => onPaste(e.target.value)}
          placeholder={hasFile ? "A file is loaded — remove it to paste instead." : "First name,Last name,Company,LinkedIn URL…"}
          className="font-num text-[12.5px]"
          aria-describedby={sourceError ? "import-source-error" : undefined}
        />
        {!hasFile && pasteText.trim() && parsedTable ? (
          <p className="font-num text-[12px] text-muted-foreground" role="status">
            {pasteText.length} characters · {rowCount} rows parsed
          </p>
        ) : null}
      </div>

      {sourceError ? (
        <p
          id="import-source-error"
          role="alert"
          className="rounded-sm bg-destructive/10 px-2.5 py-2 text-[12.5px] text-destructive"
        >
          {sourceError}
        </p>
      ) : null}
      {parseError && !sourceError ? (
        <p role="alert" className="rounded-sm bg-destructive/10 px-2.5 py-2 text-[12.5px] text-destructive">
          {parseError}
        </p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — preview & mapping
// ---------------------------------------------------------------------------

function MappingStep({
  previewQueryPending,
  previewQueryError,
  onRetryPreview,
  preview,
  mapping,
  onMappingChange,
  firstNameMapped,
}: {
  previewQueryPending: boolean;
  previewQueryError: Error | null;
  onRetryPreview: () => void;
  preview: ImportPreview | undefined;
  mapping: Record<string, string>;
  onMappingChange: (header: string, field: string) => void;
  firstNameMapped: boolean;
}) {
  if (previewQueryError) {
    return (
      <ErrorState
        message={previewQueryError.message}
        onRetry={onRetryPreview}
      />
    );
  }

  if (previewQueryPending && !preview) {
    return (
      <div className="space-y-3" role="status" aria-label="Parsing CSV">
        <div className="flex gap-2">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-6 w-20" />
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!preview) return null;

  const visibleRows = preview.rows.slice(0, 50);

  return (
    <div className="space-y-4">
      {/* Summary chips */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-sm border bg-card px-2 py-1 font-num text-[12px] font-medium text-foreground">
          {preview.rows.length} rows
        </span>
        <span className="tone-ready rounded-sm px-2 py-1 font-num text-[12px] font-medium">
          {preview.validCount} valid
        </span>
        <span className="tone-active rounded-sm px-2 py-1 font-num text-[12px] font-medium">
          {preview.duplicateCount} duplicates
        </span>
        <span className="tone-negative rounded-sm px-2 py-1 font-num text-[12px] font-medium">
          {preview.errorCount} with errors
        </span>
      </div>

      {!firstNameMapped ? (
        <p
          role="alert"
          className="rounded-sm bg-destructive/10 px-3 py-2 text-[12.5px] leading-relaxed text-destructive"
        >
          Map a name column before continuing — pick which column holds the first name (or the full
          name). Every prospect needs one.
        </p>
      ) : null}

      {/* Mapping */}
      <div>
        <p className="text-[13px] font-medium text-foreground">Pick what each column means</p>
        <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
          The guess below is automatic — correct anything that looks wrong. Unmapped columns are
          skipped.
        </p>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {preview.headers.map((header) => {
            const value = mapping[header] ?? "";
            return (
              <div key={header} className="flex items-center gap-2">
                <span
                  className="w-32 shrink-0 truncate font-num text-[12px] text-foreground"
                  title={header}
                >
                  {header}
                </span>
                <Select
                  value={value || SKIP}
                  onValueChange={(v) => onMappingChange(header, v === SKIP ? "" : v)}
                >
                  <SelectTrigger
                    size="sm"
                    className="h-8 min-w-0 flex-1 text-[12.5px]"
                    aria-label={`Column “${header}” maps to`}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SKIP}>— Skip —</SelectItem>
                    {preview.availableFields.map((f) => {
                      const usedByOther = Object.entries(mapping).some(
                        ([h, field]) => h !== header && field === f.field,
                      );
                      return (
                        <SelectItem key={f.field} value={f.field} disabled={usedByOther && value !== f.field}>
                          {f.label}
                          {f.required ? " (required)" : ""}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            );
          })}
        </div>
      </div>

      {/* Rows */}
      <div>
        <p className="text-[13px] font-medium text-foreground">Row preview</p>
        <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
          First {visibleRows.length} of {preview.rows.length} checked rows.
          {preview.rows.length >= 500
            ? " The preview caps at 500 rows; the import covers everything (validated on the way in)."
            : ""}
        </p>
        <div className="mt-2 overflow-x-auto scroll-slim rounded-md border bg-card">
          <Table className="text-[12.5px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-8 px-2 py-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                  #
                </TableHead>
                <TableHead className={ROW_TH}>Name</TableHead>
                <TableHead className={ROW_TH}>Company</TableHead>
                <TableHead className={ROW_TH}>LinkedIn</TableHead>
                <TableHead className={ROW_TH}>Email</TableHead>
                <TableHead className={ROW_TH}>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleRows.map((row) => {
                const mapped = mapRowValues(row.values, mapping, preview.headers);
                const linkedin = mapped.linkedinUrl ?? "";
                const linkedinValid = linkedin ? isValidLinkedinUrl(linkedin) : true;
                const bad = nonDuplicateErrors(row);
                const isDupe = row.duplicateLinkedin || row.duplicateEmail;
                return (
                  <TableRow key={row.index} className="h-8">
                    <TableCell className="px-2 py-1 font-num text-[11.5px] text-muted-foreground align-top">
                      {row.index + 1}
                    </TableCell>
                    <TableCell className="max-w-[14rem] truncate px-2 py-1 align-top">
                      {[mapped.firstName, mapped.lastName].filter(Boolean).join(" ") || (
                        <span className="text-muted-foreground/50">—</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[10rem] truncate px-2 py-1 align-top">
                      {mapped.companyName ?? <span className="text-muted-foreground/50">—</span>}
                    </TableCell>
                    <TableCell className="max-w-[14rem] px-2 py-1 align-top">
                      {linkedin ? (
                        <span className="flex items-center gap-1">
                          {linkedinValid ? (
                            <Link2 aria-hidden className="size-3 shrink-0 text-muted-foreground" />
                          ) : null}
                          <span
                            className={cn(
                              "truncate font-num text-[11.5px]",
                              linkedinValid ? "text-muted-foreground" : "text-destructive",
                            )}
                            title={linkedin}
                          >
                            {linkedin}
                          </span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground/50">—</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[14rem] truncate px-2 py-1 align-top">
                      {mapped.email ?? <span className="text-muted-foreground/50">—</span>}
                    </TableCell>
                    <TableCell className="px-2 py-1 align-top">
                      <div className="flex flex-col gap-0.5">
                        <div className="flex flex-wrap gap-1">
                          {row.duplicateLinkedin ? (
                            <span className="tone-active rounded-sm px-1.5 py-0.5 text-[11px] font-medium">
                              Duplicate LinkedIn
                            </span>
                          ) : null}
                          {row.duplicateEmail ? (
                            <span className="tone-active rounded-sm px-1.5 py-0.5 text-[11px] font-medium">
                              Duplicate email
                            </span>
                          ) : null}
                          {!isDupe && bad.length === 0 ? (
                            <span className="tone-ready rounded-sm px-1.5 py-0.5 text-[11px] font-medium">
                              OK
                            </span>
                          ) : null}
                        </div>
                        {bad.map((e) => (
                          <p key={e} className="text-[11.5px] leading-snug text-destructive">
                            {e}
                          </p>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

const ROW_TH =
  "h-8 px-2 py-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase";

function Count({ n }: { n: number }) {
  return <span className="font-num font-medium text-foreground">{n}</span>;
}

// ---------------------------------------------------------------------------
// Step 3 — options & confirm
// ---------------------------------------------------------------------------

function OptionsStep({
  mode,
  onModeChange,
  campaigns,
  campaignId,
  onCampaignChange,
  sourceLabel,
  onSourceLabelChange,
  validRowCount,
  duplicateRowCount,
  badRowCount,
  beyondPreviewCount,
  commitCount,
  commitError,
}: {
  mode: "create" | "update";
  onModeChange: (mode: "create" | "update") => void;
  campaigns: { id: string; name: string }[];
  campaignId: string;
  onCampaignChange: (id: string) => void;
  sourceLabel: string;
  onSourceLabelChange: (label: string) => void;
  validRowCount: number;
  duplicateRowCount: number;
  badRowCount: number;
  beyondPreviewCount: number;
  commitCount: number;
  commitError: string | null;
}) {
  return (
    <div className="space-y-5">
      <fieldset className="space-y-2">
        <legend className="text-[13px] font-medium text-foreground">Duplicates</legend>
        <RadioGroup value={mode} onValueChange={(v) => onModeChange(v as "create" | "update")}>
          <label
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2.5",
              mode === "create" ? "border-primary/60 bg-surface-subtle" : "border-border",
            )}
          >
            <RadioGroupItem value="create" className="mt-0.5" />
            <span className="space-y-0.5">
              <span className="block text-[13px] font-medium text-foreground">
                Create new records only
              </span>
              <span className="block text-[12px] leading-relaxed text-muted-foreground">
                Rows that already exist (same LinkedIn URL or email) are skipped and counted.
              </span>
            </span>
          </label>
          <label
            className={cn(
              "mt-2 flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2.5",
              mode === "update" ? "border-primary/60 bg-surface-subtle" : "border-border",
            )}
          >
            <RadioGroupItem value="update" className="mt-0.5" />
            <span className="space-y-0.5">
              <span className="block text-[13px] font-medium text-foreground">
                Update existing records
              </span>
              <span className="block text-[12px] leading-relaxed text-muted-foreground">
                Matched records get empty fields filled in from the CSV — existing values are never
                overwritten.
              </span>
            </span>
          </label>
        </RadioGroup>
      </fieldset>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="import-campaign" className="text-[13px]">
            Assign to campaign
          </Label>
          <Select value={campaignId || "none"} onValueChange={(v) => onCampaignChange(v === "none" ? "" : v)}>
            <SelectTrigger size="sm" id="import-campaign" className="h-8 text-[13px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No campaign</SelectItem>
              {campaigns.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  <span className="max-w-[16rem] truncate">{c.name}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="import-source-label" className="text-[13px]">
            Source label
          </Label>
          <Input
            id="import-source-label"
            value={sourceLabel}
            onChange={(e) => onSourceLabelChange(e.target.value)}
            maxLength={100}
            className="h-8 text-[13px]"
          />
        </div>
      </div>

      <div className="rounded-md border bg-surface-subtle px-3 py-2.5">
        <p className="text-[13px] font-medium text-foreground">Ready to import</p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
          {commitCount === 0 ? (
            <>Nothing will be imported — every row is a duplicate or has errors.</>
          ) : mode === "create" ? (
            <>
              <Count n={commitCount} /> {commitCount === 1 ? "row" : "rows"} will be created as
              new prospects.
              {duplicateRowCount > 0 ? (
                <>
                  {" "}
                  <Count n={duplicateRowCount} />{" "}
                  {duplicateRowCount === 1
                    ? "row already exists — it will be skipped."
                    : "rows already exist — they will be skipped."}
                </>
              ) : null}
            </>
          ) : (
            <>
              <Count n={validRowCount + beyondPreviewCount} />{" "}
              {validRowCount + beyondPreviewCount === 1
                ? "new record will be created."
                : "new records will be created."}
              {duplicateRowCount > 0 ? (
                <>
                  {" "}
                  <Count n={duplicateRowCount} />{" "}
                  {duplicateRowCount === 1
                    ? "row already exists — its empty fields will be filled in."
                    : "rows already exist — their empty fields will be filled in."}
                </>
              ) : null}
            </>
          )}
          {beyondPreviewCount > 0 ? (
            <>
              {" "}
              <Count n={beyondPreviewCount} /> {beyondPreviewCount === 1 ? "row" : "rows"}{" "}
              beyond the preview will be validated during import.
            </>
          ) : null}
          {badRowCount > 0 ? (
            <>
              {" "}
              <Count n={badRowCount} /> {badRowCount === 1 ? "row has" : "rows have"} problems
              and won&apos;t be imported.
            </>
          ) : null}
        </p>
      </div>

      {commitError ? (
        <p role="alert" className="rounded-sm bg-destructive/10 px-3 py-2 text-[12.5px] text-destructive">
          {commitError}
        </p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 4 — result
// ---------------------------------------------------------------------------

function ResultStep({ result }: { result: ImportResult }) {
  const stats: { label: string; value: number; tone?: string }[] = [
    { label: "Created", value: result.created, tone: "text-success" },
    { label: "Updated", value: result.updated },
    { label: "Skipped", value: result.skipped, tone: result.skipped > 0 ? "text-warning" : undefined },
    { label: "Companies created", value: result.companiesCreated },
  ];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-md border bg-card px-3 py-2">
            <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              {s.label}
            </p>
            <p className={cn("font-num mt-0.5 text-xl font-semibold", s.tone ?? "text-foreground")}>
              {s.value}
            </p>
          </div>
        ))}
      </div>

      {result.errors.length > 0 ? (
        <div>
          <p className="text-[13px] font-medium text-foreground">
            {result.errors.length} row{result.errors.length === 1 ? "" : "s"} skipped with errors
          </p>
          <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto scroll-slim rounded-md border bg-card p-2">
            {result.errors.map((e, i) => (
              <li key={i} className="text-[12px] leading-relaxed text-destructive">
                {e}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-[13px] text-muted-foreground">
          Every row went through — no errors reported.
        </p>
      )}
    </div>
  );
}
