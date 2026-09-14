// Zod validation schemas for all mutating endpoints.
// Server-side validation is the source of truth (spec §32) — the client
// mirrors these for fast feedback but never replaces them.

import { z } from "zod";
import {
  ACTIVITY_TYPES,
  CAMPAIGN_STATUSES,
  COMPANY_STATUSES,
  PRIORITIES,
  PROSPECT_STATUSES,
  VERIFICATION_STATUSES,
} from "./constants";
import { isValidEmail, isValidLinkedinUrl } from "./normalize";

// Optional text fields. PATCH semantics depend on the difference between
// undefined (field not sent — leave untouched) and null/"" (clear the field).
// The transforms below therefore preserve `undefined`.
const optionalTrimmed = z
  .string()
  .trim()
  .max(2000)
  .optional()
  .nullable()
  .transform((v) => (v === "" ? null : v));

const optionalLongText = z
  .string()
  .max(20000)
  .optional()
  .nullable()
  .transform((v) => (v === "" ? null : v));

export const prospectCreateSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required.").max(100),
  lastName: optionalTrimmed,
  jobTitle: optionalTrimmed,
  companyId: optionalTrimmed,
  companyName: optionalTrimmed, // convenience: create/find company by name
  linkedinUrl: z
    .string()
    .trim()
    .max(500)
    .optional()
    .nullable()
    .transform((v) => (v === "" ? null : v))
    .refine((v) => !v || isValidLinkedinUrl(v) || v.length < 8, {
      message: "This does not look like a LinkedIn profile URL.",
    }),
  email: optionalTrimmed.refine((v) => !v || isValidEmail(v), {
    message: "This is not a valid email address.",
  }),
  location: optionalTrimmed,
  source: optionalTrimmed,
  campaignId: optionalTrimmed,
  status: z.enum(PROSPECT_STATUSES).optional().default("Researching"),
  priority: z.enum(PRIORITIES).optional().default("Medium"),
  fitScore: z.coerce.number().int().min(0).max(100).optional().nullable(),
  researchNotes: optionalLongText,
  outreachAngle: optionalLongText,
  notes: optionalLongText,
  tags: optionalTrimmed,
});

export const prospectUpdateSchema = z.object({
  firstName: z.string().trim().min(1).max(100).optional(),
  lastName: optionalTrimmed,
  jobTitle: optionalTrimmed,
  companyId: optionalTrimmed,
  linkedinUrl: z
    .string()
    .trim()
    .max(500)
    .optional()
    .nullable()
    .transform((v) => (v === "" ? null : v)),
  email: optionalTrimmed.refine((v) => !v || isValidEmail(v), {
    message: "This is not a valid email address.",
  }),
  location: optionalTrimmed,
  source: optionalTrimmed,
  campaignId: optionalTrimmed,
  status: z.enum(PROSPECT_STATUSES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  fitScore: z.coerce.number().int().min(0).max(100).optional().nullable(),
  researchNotes: optionalLongText,
  outreachAngle: optionalLongText,
  notes: optionalLongText,
  tags: optionalTrimmed,
  nextFollowUpDate: z
    .string()
    .optional()
    .nullable()
    .transform((v) => (v === "" ? null : v)),
  // explicit lifecycle date edits (data quality repairs)
  connectionRequestDate: z
    .string()
    .optional()
    .nullable()
    .transform((v) => (v === "" ? null : v)),
  connectionAcceptedDate: z
    .string()
    .optional()
    .nullable()
    .transform((v) => (v === "" ? null : v)),
  firstMessageDate: z
    .string()
    .optional()
    .nullable()
    .transform((v) => (v === "" ? null : v)),
});

export const activityCreateSchema = z.object({
  prospectId: z.string().min(1),
  companyId: optionalTrimmed,
  campaignId: optionalTrimmed,
  activityType: z.enum(ACTIVITY_TYPES),
  occurredAt: z.string().optional(), // ISO date
  notes: optionalLongText,
  messageText: optionalLongText,
});

export const companyCreateSchema = z.object({
  name: z.string().trim().min(1, "Company name is required.").max(200),
  website: optionalTrimmed,
  linkedinUrl: optionalTrimmed,
  industry: optionalTrimmed,
  location: optionalTrimmed,
  companySize: optionalTrimmed,
  source: optionalTrimmed,
  // No .default() here: defaults belong to the create ROUTE, otherwise
  // companyUpdateSchema.partial() would reset status on every minimal PATCH.
  status: z.enum(COMPANY_STATUSES).optional(),
  notes: optionalLongText,
  tags: optionalTrimmed,
});

export const companyUpdateSchema = companyCreateSchema.partial();

export const campaignCreateSchema = z.object({
  name: z.string().trim().min(1, "Campaign name is required.").max(200),
  description: optionalLongText,
  targetAudience: optionalLongText,
  status: z.enum(CAMPAIGN_STATUSES).optional(),
  startDate: z
    .string()
    .optional()
    .nullable()
    .transform((v) => (v === "" ? null : v)),
  endDate: z
    .string()
    .optional()
    .nullable()
    .transform((v) => (v === "" ? null : v)),
  notes: optionalLongText,
});

export const campaignUpdateSchema = campaignCreateSchema.partial();

export const followUpActionSchema = z.object({
  action: z.enum(["complete", "reschedule", "skip", "completeAndReschedule"]),
  date: z
    .string()
    .optional()
    .nullable()
    .transform((v) => (v === "" || v === undefined ? null : v)),
  notes: optionalLongText,
});

export const verificationSchema = z.object({
  fields: z.record(z.string(), z.boolean()),
  notes: optionalLongText,
});

export const bulkActionSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, "Select at least one record."),
  action: z.enum(["status", "priority", "campaign", "archive", "restore", "delete", "verification"]),
  value: z.string().optional(),
});

export const settingsSchema = z.object({
  defaultFollowUpDays: z.coerce.number().int().min(0).max(60).optional(),
  weeklyConnectionTarget: z.coerce.number().int().min(0).max(500).optional(),
  operatorName: z.string().trim().max(100).optional(),
  linkedinChecklistUrl: z.string().trim().max(500).optional(),
});

export const savedViewSchema = z.object({
  name: z.string().trim().min(1, "Give the view a name.").max(100),
  filters: z.record(z.string(), z.unknown()).optional(),
});

export const mergeSchema = z.object({
  targetId: z.string().min(1),
  sourceId: z.string().min(1),
});

export const importCommitSchema = z.object({
  rows: z.array(z.record(z.string(), z.string())).min(1),
  mapping: z.record(z.string(), z.string()),
  mode: z.enum(["create", "update"]),
  campaignId: optionalTrimmed,
  sourceLabel: optionalTrimmed,
});

export function zodErrorMessage(error: z.ZodError): string {
  const first = error.issues[0];
  if (!first) return "The submitted data is invalid.";
  const field = first.path.length ? `${first.path.join(".")}: ` : "";
  return `${field}${first.message}`;
}
