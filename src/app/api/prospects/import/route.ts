import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { parseCsv, suggestMapping } from "@/lib/csv";
import {
  importCommitSchema,
  prospectCreateSchema,
  zodErrorMessage,
} from "@/lib/validation";
import { isValidEmail, isValidLinkedinUrl, normalizeCompanyName } from "@/lib/normalize";
import type { ImportPreview, ImportPreviewRow, ImportResult } from "@/lib/types";

const IMPORT_FIELDS: { field: string; label: string; required: boolean }[] = [
  { field: "firstName", label: "First name", required: true },
  { field: "lastName", label: "Last name", required: false },
  { field: "fullName", label: "Full name", required: false },
  { field: "jobTitle", label: "Job title", required: false },
  { field: "companyName", label: "Company name", required: false },
  { field: "linkedinUrl", label: "LinkedIn URL", required: false },
  { field: "email", label: "Email", required: false },
  { field: "location", label: "Location", required: false },
  { field: "source", label: "Source", required: false },
  { field: "notes", label: "Notes", required: false },
  { field: "tags", label: "Tags", required: false },
  { field: "fitScore", label: "Fit score (0–100)", required: false },
  { field: "campaignName", label: "Campaign name", required: false },
];

export async function POST(req: NextRequest) {
  const guard = await requireSession(req);
  if ("response" in guard) return guard.response;

  let body: { stage?: string; csv?: string; mapping?: Record<string, string> } & Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Could not read the import request." }, { status: 400 });
  }

  const stage = body.stage ?? "preview";

  if (stage === "preview") {
    return handlePreview(body);
  }
  if (stage === "commit") {
    return handleCommit(body);
  }
  return Response.json({ error: `Unknown import stage "${stage}".` }, { status: 400 });
}

// ---------------------------------------------------------------------------
// Preview: parse + suggest mapping + detect duplicates/invalid rows
// ---------------------------------------------------------------------------

async function handlePreview(body: { csv?: string; mapping?: Record<string, string> }) {
  const csv = body.csv ?? "";
  if (!csv.trim()) {
    return Response.json({ error: "The file appears to be empty." }, { status: 400 });
  }
  if (csv.length > 5_000_000) {
    return Response.json({ error: "The file is too large (limit ~5 MB of CSV)." }, { status: 413 });
  }

  const table = parseCsv(csv);
  if (table.length < 2) {
    return Response.json(
      { error: "The file needs a header row and at least one data row." },
      { status: 400 },
    );
  }

  const headers = table[0].map((h, i) => h.trim() || `Column ${i + 1}`);
  const mapping = { ...suggestMapping(headers), ...(body.mapping ?? {}) };

  const dataRows = table.slice(1, 501); // preview cap

  // Existing records for duplicate detection.
  const linkedinSet = new Set(
    (await db.prospect.findMany({ where: { linkedinUrl: { not: null } }, select: { linkedinUrl: true, id: true } }))
      .map((p) => p.linkedinUrl!),
  );
  const emailSet = new Set(
    (await db.prospect.findMany({ where: { email: { not: null } }, select: { email: true } }))
      .map((p) => p.email!.toLowerCase()),
  );

  const rows: ImportPreviewRow[] = dataRows.map((raw, index) => {
    const values: Record<string, string> = {};
    headers.forEach((h, i) => {
      values[h] = (raw[i] ?? "").trim();
    });

    const mapped = applyMapping(values, mapping, headers);
    const errors: string[] = [];

    if (!mapped.firstName && !mapped.fullName) {
      errors.push("No first name or full name mapped.");
    }
    if (mapped.email && !isValidEmail(mapped.email)) {
      errors.push(`"${mapped.email}" is not a valid email.`);
    }
    if (mapped.linkedinUrl && !isValidLinkedinUrl(mapped.linkedinUrl) && mapped.linkedinUrl.length >= 8) {
      errors.push("LinkedIn URL looks malformed.");
    }
    if (mapped.fitScore != null && mapped.fitScore !== "") {
      const score = Number(mapped.fitScore);
      if (!Number.isFinite(score) || score < 0 || score > 100) {
        errors.push("Fit score must be a whole number between 0 and 100.");
      }
    }

    const dupeLi = Boolean(mapped.linkedinUrl && linkedinSet.has(mapped.linkedinUrl));
    if (dupeLi) errors.push("LinkedIn URL already exists in your database.");
    const dupeEmail = Boolean(mapped.email && emailSet.has(mapped.email.toLowerCase()));
    if (dupeEmail) errors.push("Email already exists in your database.");

    return {
      index,
      values,
      duplicateLinkedin: dupeLi,
      duplicateEmail: dupeEmail,
      errors,
    };
  });

  const preview: ImportPreview = {
    headers,
    rows,
    mapping,
    availableFields: IMPORT_FIELDS,
    validCount: rows.filter((r) => r.errors.length === 0).length,
    duplicateCount: rows.filter((r) => r.duplicateLinkedin || r.duplicateEmail).length,
    errorCount: rows.filter((r) => r.errors.length > 0).length,
  };

  return Response.json(preview);
}

function applyMapping(
  values: Record<string, string>,
  mapping: Record<string, string>,
  headers: string[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const h of headers) {
    const field = mapping[h];
    if (field && values[h] !== "") {
      out[field] = values[h];
    }
  }
  // Full name → split if firstName not mapped directly.
  if (out.fullName && !out.firstName) {
    const parts = out.fullName.trim().split(/\s+/);
    out.firstName = parts[0] ?? "";
    if (parts.length > 1) out.lastName = parts.slice(1).join(" ");
  }
  return out;
}

// ---------------------------------------------------------------------------
// Commit: create/update within a transaction
// ---------------------------------------------------------------------------

async function handleCommit(body: unknown) {
  const parsed = importCommitSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });
  }
  const { rows, mapping, mode, campaignId, sourceLabel } = parsed.data;
  if (rows.length > 2000) {
    return Response.json({ error: "Import limit is 2,000 rows per run." }, { status: 413 });
  }

  const result: ImportResult = {
    created: 0, updated: 0, skipped: 0, companiesCreated: 0, errors: [],
  };

  const headers = Object.keys(mapping);
  const companyCache = new Map<string, string>();

  for (const raw of rows) {
    const mapped = applyMapping(raw, mapping, headers);
    const prospectData = prospectCreateSchema.safeParse({
      firstName: mapped.firstName ?? "",
      lastName: mapped.lastName ?? null,
      jobTitle: mapped.jobTitle ?? null,
      companyName: mapped.companyName ?? null,
      linkedinUrl: mapped.linkedinUrl ?? null,
      email: mapped.email ?? null,
      location: mapped.location ?? null,
      source: mapped.source ?? sourceLabel ?? "CSV Import",
      campaignId: campaignId ?? null,
      notes: mapped.notes ?? null,
      tags: mapped.tags ?? null,
      fitScore: mapped.fitScore ?? null,
    });
    if (!prospectData.success) {
      result.skipped++;
      result.errors.push(`Row skipped: ${zodErrorMessage(prospectData.error)}`);
      continue;
    }
    const data = prospectData.data;

    try {
      await db.$transaction(async (tx) => {
        // Duplicate checks — hard stop on identifiers in "create" mode.
        let existingId: string | null = null;
        if (data.linkedinUrl) {
          const found = await tx.prospect.findFirst({ where: { linkedinUrl: data.linkedinUrl }, select: { id: true } });
          if (found) existingId = found.id;
        }
        if (!existingId && data.email) {
          const found = await tx.prospect.findFirst({ where: { email: data.email }, select: { id: true } });
          if (found) existingId = found.id;
        }

        if (existingId) {
          if (mode === "create") {
            result.skipped++;
            return;
          }
          // Update mode: fill gaps only — never overwrite existing values (spec §23).
          const current = await tx.prospect.findUniqueOrThrow({ where: { id: existingId } });
          await tx.prospect.update({
            where: { id: existingId },
            data: {
              jobTitle: current.jobTitle ? undefined : (data.jobTitle ?? undefined),
              location: current.location ? undefined : (data.location ?? undefined),
              linkedinUrl: current.linkedinUrl ? undefined : (data.linkedinUrl ?? undefined),
              email: current.email ? undefined : (data.email ?? undefined),
              notes: current.notes ? undefined : (data.notes ?? undefined),
              campaignId: current.campaignId ? undefined : (data.campaignId ?? undefined),
            },
          });
          result.updated++;
          return;
        }

        // Company resolution (dedupe by normalized name).
        let companyId: string | null = null;
        if (data.companyName) {
          const norm = normalizeCompanyName(data.companyName);
          if (norm) {
            const cached = companyCache.get(norm);
            if (cached) {
              companyId = cached;
            } else {
              const found = await tx.company.findFirst({ where: { normalizedName: norm } });
              if (found) {
                companyId = found.id;
              } else {
                const created = await tx.company.create({
                  data: { name: data.companyName, normalizedName: norm, source: "CSV Import" },
                });
                companyId = created.id;
                result.companiesCreated++;
              }
              companyCache.set(norm, companyId);
            }
          }
        }

        await tx.prospect.create({
          data: {
            firstName: data.firstName,
            lastName: data.lastName,
            jobTitle: data.jobTitle,
            companyId,
            linkedinUrl: data.linkedinUrl,
            email: data.email,
            location: data.location,
            source: data.source,
            campaignId: data.campaignId,
            status: "Researching",
            priority: data.priority,
            fitScore: data.fitScore,
            notes: data.notes,
            tags: data.tags,
            dateAdded: new Date(),
          },
        });
        result.created++;
      });
    } catch (e) {
      result.skipped++;
      const msg = e instanceof Error ? e.message : "unknown error";
      result.errors.push(`Row skipped: ${msg}`);
    }
  }

  return Response.json(result);
}
