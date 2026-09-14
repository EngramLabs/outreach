// Prospect list query building + serialization shared by list, export,
// dashboard, and search routes.

import type { Prisma, Prospect, Company, Campaign } from "@prisma/client";
import type { ProspectsQuery, ProspectRow } from "./types";
import {
  PROSPECT_STATUSES,
  type ProspectStatus,
} from "./constants";
import { normalizeLinkedinUrl, startOfDay, addDays, endOfDay } from "./normalize";
import { db } from "./db";

type ProspectWithRefs = Prospect & {
  company: Pick<Company, "id" | "name"> | null;
  campaign: Pick<Campaign, "id" | "name"> | null;
};

// ---------------------------------------------------------------------------
// Where-clause builder
// ---------------------------------------------------------------------------

export function buildProspectWhere(q: ProspectsQuery): Prisma.ProspectWhereInput {
  const where: Prisma.ProspectWhereInput = {};
  const and: Prisma.ProspectWhereInput[] = [];

  // Archive scope
  where.archivedAt = q.archived ? { not: null } : null;

  if (q.query?.trim()) {
    const s = q.query.trim();
    and.push({
      OR: [
        { firstName: { contains: s } },
        { lastName: { contains: s } },
        { jobTitle: { contains: s } },
        { email: { contains: s } },
        { location: { contains: s } },
        { notes: { contains: s } },
        { company: { name: { contains: s } } },
        { campaign: { name: { contains: s } } },
      ],
    });
  }

  if (q.status && q.status !== "all") {
    const list = q.status.split(",").map((s) => s.trim()).filter(Boolean);
    if (list.length === 1 && list[0].startsWith("group:")) {
      const group = list[0].slice("group:".length);
      and.push({ status: { in: statusesInGroup(group) } });
    } else {
      and.push({ status: { in: list } });
    }
  }

  if (q.priority && q.priority !== "all") {
    and.push({ priority: q.priority });
  }

  if (q.companyId) {
    if (q.companyId === "none") and.push({ companyId: null });
    else and.push({ companyId: q.companyId });
  }

  if (q.campaignId) {
    if (q.campaignId === "none") and.push({ campaignId: null });
    else and.push({ campaignId: q.campaignId });
  }

  if (q.verification) {
    if (q.verification === "none") and.push({
      OR: [{ verificationStatus: null }, { verificationStatus: "Unverified" }],
    });
    else and.push({ verificationStatus: q.verification });
  }

  if (q.tag) {
    and.push({ tags: { contains: q.tag } });
  }

  const now = new Date();
  if (q.hasFollowUp === "any") {
    and.push({ nextFollowUpDate: { not: null } });
  } else if (q.hasFollowUp === "overdue") {
    and.push({ nextFollowUpDate: { lt: startOfDay(now) } });
  } else if (q.hasFollowUp === "today") {
    and.push({
      nextFollowUpDate: { gte: startOfDay(now), lte: endOfDay(now) },
    });
  } else if (q.hasFollowUp === "week") {
    and.push({
      nextFollowUpDate: { gte: startOfDay(now), lte: endOfDay(addDays(now, 7)) },
    });
  } else if (q.hasFollowUp === "none") {
    and.push({ nextFollowUpDate: null });
  }

  if (q.missing) {
    switch (q.missing) {
      case "company": and.push({ companyId: null }); break;
      case "role": and.push({ jobTitle: null }); break;
      case "linkedin": and.push({ linkedinUrl: null }); break;
      case "email": and.push({ email: null }); break;
      case "campaign": and.push({ campaignId: null }); break;
    }
  }

  if (q.issue) {
    switch (q.issue) {
      case "connected-no-date":
        and.push({ status: "Connected", connectionAcceptedDate: null });
        break;
      case "request-no-date":
        and.push({ status: "Request Sent", connectionRequestDate: null });
        break;
      case "followup-no-date":
        and.push({
          status: "Follow-Up",
          nextFollowUpDate: null,
          lastContactDate: null,
        });
        break;
      case "converted-no-activity":
        and.push({
          status: "Converted",
          activities: { none: { activityType: { in: ["Meeting", "Reply Received", "Email"] } } },
        });
        break;
      // impossible-dates handled in memory (SQLite can't cross-compare columns)
    }
  }

  if (and.length > 0) where.AND = and;
  return where;
}

function statusesInGroup(group: string): string[] {
  return PROSPECT_STATUSES.filter((s) => statusGroupOf(s) === group);
}

function statusGroupOf(s: ProspectStatus): string {
  switch (s) {
    case "Researching":
    case "Needs Verification":
      return "research";
    case "Verified":
    case "Ready":
      return "ready";
    case "Request Sent":
    case "Connected":
    case "Messaged":
    case "Follow-Up":
      return "active";
    case "Replied":
    case "Meeting":
    case "Converted":
      return "responding";
    case "Not Interested":
    case "No Response":
      return "closed-negative";
    case "Archived":
      return "archived";
    default:
      return "research";
  }
}

/** In-memory filters that SQL (SQLite) cannot express. */
export function postFilterProspects(
  rows: ProspectWithRefs[],
  q: ProspectsQuery,
): ProspectWithRefs[] {
  if (!q.issue && !q.invalid && !q.ids) return rows;
  let out = rows;
  if (q.ids) {
    const wanted = new Set(q.ids.split(",").map((s) => s.trim()).filter(Boolean));
    out = out.filter((p) => wanted.has(p.id));
  }
  if (q.invalid === "linkedin") {
    out = out.filter((p) => p.linkedinUrl && !looksValidLi(p.linkedinUrl));
  }
  if (q.issue === "impossible-dates") {
    out = out.filter((p) => {
      const { connectionRequestDate: req, connectionAcceptedDate: acc, firstMessageDate: first, lastContactDate: last } = p;
      if (req && acc && acc < req) return true;
      if (first && last && last < first) return true;
      if (first && req && startOfDay(first) < addDays(startOfDay(req), -7)) return true;
      return false;
    });
  }
  return out;
}

function looksValidLi(url: string): boolean {
  return /^https?:\/\/([\w-]+\.)?linkedin\.com\/(in|pub)\/[\w\-%.]+\/?$/i.test(url.trim());
}

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

const PRIORITY_RANK: Record<string, number> = { High: 0, Medium: 1, Low: 2 };

export function orderClause(
  sort: string | undefined,
  order: "asc" | "desc" | undefined,
): Prisma.ProspectOrderByWithRelationInput[] {
  const dir = order === "desc" ? "desc" : "asc";
  switch (sort) {
    case "name":
      return [{ firstName: dir }, { lastName: dir }];
    case "company":
      return [{ company: { name: dir } }, { firstName: "asc" }];
    case "status":
      return [{ status: dir }];
    case "fitScore":
      return [{ fitScore: dir }];
    case "nextFollowUp":
      return [{ nextFollowUpDate: dir }, { firstName: "asc" }];
    case "lastContact":
      return [{ lastContactDate: { sort: dir, nulls: "last" } }, { firstName: "asc" }];
    case "dateAdded":
      return [{ dateAdded: dir }];
    case "campaign":
      return [{ campaign: { name: dir } }, { firstName: "asc" }];
    default:
      return [{ updatedAt: "desc" }];
  }
}

/** JS re-sort for semantics SQL can't express (priority rank). */
export function sortProspectsInMemory(
  rows: ProspectWithRefs[],
  sort: string | undefined,
  order: "asc" | "desc" | undefined,
): ProspectWithRefs[] {
  if (sort === "priority") {
    const dir = order === "desc" ? -1 : 1;
    return rows.slice().sort((a, b) => {
      const ra = PRIORITY_RANK[a.priority] ?? 1;
      const rb = PRIORITY_RANK[b.priority] ?? 1;
      if (ra !== rb) return (ra - rb) * dir;
      return a.firstName.localeCompare(b.firstName);
    });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

export function serializeProspectRow(p: ProspectWithRefs): ProspectRow {
  return {
    id: p.id,
    firstName: p.firstName,
    lastName: p.lastName,
    jobTitle: p.jobTitle,
    companyId: p.companyId,
    companyName: p.company?.name ?? null,
    linkedinUrl: p.linkedinUrl,
    email: p.email,
    location: p.location,
    source: p.source,
    campaignId: p.campaignId,
    campaignName: p.campaign?.name ?? null,
    status: p.status,
    priority: p.priority,
    fitScore: p.fitScore,
    verificationStatus: p.verificationStatus,
    dateAdded: p.dateAdded.toISOString(),
    connectionRequestDate: p.connectionRequestDate?.toISOString() ?? null,
    connectionAcceptedDate: p.connectionAcceptedDate?.toISOString() ?? null,
    firstMessageDate: p.firstMessageDate?.toISOString() ?? null,
    lastContactDate: p.lastContactDate?.toISOString() ?? null,
    nextFollowUpDate: p.nextFollowUpDate?.toISOString() ?? null,
    followUpCount: p.followUpCount,
    archivedAt: p.archivedAt?.toISOString() ?? null,
    updatedAt: p.updatedAt.toISOString(),
  };
}

export async function listProspects(
  q: ProspectsQuery,
): Promise<{ rows: ProspectWithRefs[]; total: number }> {
  const where = buildProspectWhere(q);
  const needsInMemory = Boolean(q.issue || q.invalid || q.ids || q.sort === "priority");

  if (needsInMemory) {
    const all = await db.prospect.findMany({
      where,
      include: { company: { select: { id: true, name: true } }, campaign: { select: { id: true, name: true } } },
    });
    const filtered = postFilterProspects(all, q);
    const sorted = sortProspectsInMemory(filtered, q.sort, q.order);
    const total = sorted.length;
    const page = Math.max(1, q.page ?? 1);
    const pageSize = Math.min(200, Math.max(10, q.pageSize ?? 50));
    const start = (page - 1) * pageSize;
    return { rows: sorted.slice(start, start + pageSize), total };
  }

  const total = await db.prospect.count({ where });
  const page = Math.max(1, q.page ?? 1);
  const pageSize = Math.min(200, Math.max(10, q.pageSize ?? 50));
  const rows = await db.prospect.findMany({
    where,
    include: { company: { select: { id: true, name: true } }, campaign: { select: { id: true, name: true } } },
    orderBy: orderClause(q.sort, q.order),
    skip: (page - 1) * pageSize,
    take: pageSize,
  });
  return { rows, total };
}
