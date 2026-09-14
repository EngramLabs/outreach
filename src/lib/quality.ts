// Data quality detection (spec §19). Issues are COMPUTED on demand from the
// live database — never stored stale. Dismissals are persisted in Settings.
// Every issue carries an actionable fix target the UI can execute.

import { db } from "./db";
import type { DataQualityIssue, DataQualitySummary, IssueSeverity } from "./types";
import {
  addDays,
  normalizeLinkedinUrl,
  normalizePersonName,
  startOfDay,
} from "./normalize";

interface ProspectLike {
  id: string;
  firstName: string;
  lastName: string | null;
  jobTitle: string | null;
  companyId: string | null;
  linkedinUrl: string | null;
  email: string | null;
  status: string;
  campaignId: string | null;
  connectionRequestDate: Date | null;
  connectionAcceptedDate: Date | null;
  firstMessageDate: Date | null;
  lastContactDate: Date | null;
  nextFollowUpDate: Date | null;
  archivedAt: Date | null;
  updatedAt: Date;
}

interface CompanyLike {
  id: string;
  name: string;
  normalizedName: string;
  website: string | null;
  linkedinUrl: string | null;
  status: string;
}

const DISMISSED_KEY = "dq_dismissed";

export async function getDismissedKeys(): Promise<Set<string>> {
  const setting = await db.setting.findUnique({ where: { key: DISMISSED_KEY } });
  if (!setting) return new Set();
  try {
    return new Set(JSON.parse(setting.value) as string[]);
  } catch {
    return new Set();
  }
}

export async function setDismissedKeys(keys: Set<string>): Promise<void> {
  await db.setting.upsert({
    where: { key: DISMISSED_KEY },
    update: { value: JSON.stringify(Array.from(keys)) },
    create: { key: DISMISSED_KEY, value: JSON.stringify(Array.from(keys)) },
  });
}

function groupBy<T>(items: T[], key: (t: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const arr = map.get(k);
    if (arr) arr.push(item);
    else map.set(k, [item]);
  }
  return map;
}

const OUTREACH_ACTIVE = [
  "Request Sent",
  "Connected",
  "Messaged",
  "Follow-Up",
  "Replied",
  "Meeting",
];

export async function runQualityScan(): Promise<DataQualitySummary> {
  const prospects = (await db.prospect.findMany({
    where: { archivedAt: null },
    include: { company: { select: { name: true } }, campaign: { select: { name: true } } },
  })) as unknown as (ProspectLike & {
    company: { name: string } | null;
    campaign: { name: string } | null;
  })[];
  const companies = (await db.company.findMany()) as unknown as CompanyLike[];

  // Conversion activities per prospect (for "Converted without activity").
  const convertedProspects = prospects.filter((p) => p.status === "Converted");
  let meetingActivityIds = new Set<string>();
  if (convertedProspects.length > 0) {
    const acts = await db.activity.findMany({
      where: {
        prospectId: { in: convertedProspects.map((p) => p.id) },
        activityType: { in: ["Meeting", "Reply Received", "Email"] },
      },
      select: { prospectId: true },
    });
    meetingActivityIds = new Set(acts.map((a) => a.prospectId));
  }

  const issues: DataQualityIssue[] = [];
  const dismissed = await getDismissedKeys();

  const push = (issue: DataQualityIssue) => {
    if (dismissed.has(issue.key)) issue.dismissed = true;
    issues.push(issue);
  };

  // --- Duplicate LinkedIn URLs ---------------------------------------------
  const liGroups = groupBy(
    prospects.filter((p) => p.linkedinUrl),
    (p) => normalizeLinkedinUrl(p.linkedinUrl!),
  );
  for (const [url, group] of liGroups) {
    if (group.length > 1) {
      push({
        key: `dup-linkedin:${url}`,
        type: "duplicate-linkedin",
        severity: "high",
        title: `${group.length} prospects share one LinkedIn URL`,
        description: `linkedin.com${url.startsWith("linkedin.com") ? url.slice("linkedin.com".length) : "/" + url} — these are likely the same person imported twice.`,
        prospectIds: group.map((g) => g.id),
        prospectCount: group.length,
        fixLabel: "Review & merge",
        fixHref: "merge:" + group.map((g) => g.id).join(","),
      });
    }
  }

  // --- Duplicate emails ------------------------------------------------------
  const emailGroups = groupBy(
    prospects.filter((p) => p.email),
    (p) => p.email!.toLowerCase().trim(),
  );
  for (const [email, group] of emailGroups) {
    if (group.length > 1) {
      push({
        key: `dup-email:${email}`,
        type: "duplicate-email",
        severity: "high",
        title: `${group.length} prospects share the email ${email}`,
        description:
          "The same email on two people is usually a duplicate record or a data-entry error.",
        prospectIds: group.map((g) => g.id),
        prospectCount: group.length,
        fixLabel: "Review & merge",
        fixHref: "merge:" + group.map((g) => g.id).join(","),
      });
    }
  }

  // --- Possible duplicate people (same normalized name) ----------------------
  const nameGroups = groupBy(prospects, (p) =>
    normalizePersonName(p.firstName, p.lastName),
  );
  const sameNamePairs: typeof prospects = [];
  for (const [, group] of nameGroups) {
    if (group.length > 1) {
      // only suspicious when at same company or both missing company
      for (let i = 0; i < group.length - 1; i++) {
        const a = group[i];
        const b = group[i + 1];
        if (
          (a.companyId && a.companyId === b.companyId) ||
          (!a.companyId && !b.companyId)
        ) {
          sameNamePairs.push(a, b);
        }
      }
    }
  }
  if (sameNamePairs.length > 0) {
    const uniqueIds = Array.from(new Set(sameNamePairs.map((p) => p.id)));
    push({
      key: "dup-people",
      type: "duplicate-people",
      severity: "medium",
      title: `Possible duplicate people (${uniqueIds.length} records)`,
      description:
        "Same name at the same company (or without a company). Review these side by side before merging.",
      prospectIds: uniqueIds,
      prospectCount: uniqueIds.length,
      fixLabel: "Review records",
      fixHref: "prospects?ids=" + uniqueIds.join(","),
    });
  }

  // --- Duplicate companies ----------------------------------------------------
  const companyGroups = groupBy(
    companies.filter((c) => c.status === "Active"),
    (c) => c.normalizedName,
  );
  for (const [, group] of companyGroups) {
    if (group.length > 1) {
      push({
        key: `dup-company:${group[0].normalizedName}`,
        type: "duplicate-company",
        severity: "medium",
        title: `Duplicate company: ${group[0].name}`,
        description: `${group.map((c) => c.name).join(" / ")} normalize to the same name. Keep one record and re-attach the prospects.`,
        companyIds: group.map((c) => c.id),
        companyCount: group.length,
        fixLabel: "Open companies",
        fixHref: "companies?ids=" + group.map((c) => c.id).join(","),
      });
    }
  }

  // --- Field gaps (aggregated, not one issue per prospect) --------------------
  const missingCompany = prospects.filter((p) => !p.companyId);
  if (missingCompany.length > 0) {
    push({
      key: "missing-company",
      type: "missing-field",
      severity: "medium",
      title: `${missingCompany.length} prospects have no company`,
      description:
        "Company context drives outreach relevance. Attach a company before moving these to Ready.",
      prospectIds: missingCompany.map((p) => p.id),
      prospectCount: missingCompany.length,
      fixLabel: "Filter to these",
      fixHref: "prospects?missing=company",
    });
  }

  const missingRole = prospects.filter((p) => !p.jobTitle);
  if (missingRole.length > 0) {
    push({
      key: "missing-role",
      type: "missing-field",
      severity: "low",
      title: `${missingRole.length} prospects have no job title`,
      description: "Role determines whether the outreach angle still applies.",
      prospectIds: missingRole.map((p) => p.id),
      prospectCount: missingRole.length,
      fixLabel: "Filter to these",
      fixHref: "prospects?missing=role",
    });
  }

  const missingLinkedIn = prospects.filter(
    (p) => !p.linkedinUrl && p.status !== "Researching",
  );
  if (missingLinkedIn.length > 0) {
    push({
      key: "missing-linkedin",
      type: "missing-field",
      severity: "medium",
      title: `${missingLinkedIn.length} prospects past research have no LinkedIn URL`,
      description:
        "You cannot run the LinkedIn workflow without a profile URL. Capture it before Request Sent.",
      prospectIds: missingLinkedIn.map((p) => p.id),
      prospectCount: missingLinkedIn.length,
      fixLabel: "Filter to these",
      fixHref: "prospects?missing=linkedin",
    });
  }

  const missingEmailLate = prospects.filter(
    (p) => !p.email && (p.status === "Meeting" || p.status === "Converted"),
  );
  if (missingEmailLate.length > 0) {
    push({
      key: "missing-email-late",
      type: "missing-field",
      severity: "low",
      title: `${missingEmailLate.length} prospects in late stage have no email`,
      description:
        "Meetings and hand-offs move faster over email. Add one where you have it.",
      prospectIds: missingEmailLate.map((p) => p.id),
      prospectCount: missingEmailLate.length,
      fixLabel: "Filter to these",
      fixHref: "prospects?missing=email",
    });
  }

  const missingCampaignActive = prospects.filter(
    (p) => !p.campaignId && OUTREACH_ACTIVE.includes(p.status),
  );
  if (missingCampaignActive.length > 0) {
    push({
      key: "missing-campaign-active",
      type: "missing-field",
      severity: "low",
      title: `${missingCampaignActive.length} prospects in active outreach have no campaign`,
      description:
        "Without a campaign their results are excluded from campaign performance.",
      prospectIds: missingCampaignActive.map((p) => p.id),
      prospectCount: missingCampaignActive.length,
      fixLabel: "Filter to these",
      fixHref: "prospects?missing=campaign",
    });
  }

  // --- Invalid URLs ------------------------------------------------------------
  const invalidLinkedIn = prospects.filter(
    (p) => p.linkedinUrl && !isValidLi(p.linkedinUrl),
  );
  if (invalidLinkedIn.length > 0) {
    push({
      key: "invalid-linkedin-url",
      type: "invalid-url",
      severity: "medium",
      title: `${invalidLinkedIn.length} LinkedIn URLs are malformed`,
      description:
        "These links will fail or open the wrong page. Check for typos or truncated imports.",
      prospectIds: invalidLinkedIn.map((p) => p.id),
      prospectCount: invalidLinkedIn.length,
      fixLabel: "Filter to these",
      fixHref: "prospects?invalid=linkedin",
    });
  }
  const invalidCompanySite = companies.filter(
    (c) => c.website && !c.website.startsWith("http"),
  );
  if (invalidCompanySite.length > 0) {
    push({
      key: "invalid-company-website",
      type: "invalid-url",
      severity: "low",
      title: `${invalidCompanySite.length} company websites are malformed`,
      description: "Website fields should be full URLs (https://…).",
      companyIds: invalidCompanySite.map((c) => c.id),
      companyCount: invalidCompanySite.length,
      fixLabel: "Open companies",
      fixHref: "companies?ids=" + invalidCompanySite.map((c) => c.id).join(","),
    });
  }

  // --- Inconsistent status/date combinations -----------------------------------
  const connectedNoDate = prospects.filter(
    (p) => p.status === "Connected" && !p.connectionAcceptedDate,
  );
  if (connectedNoDate.length > 0) {
    push({
      key: "connected-no-date",
      type: "status-date-mismatch",
      severity: "medium",
      title: `${connectedNoDate.length} Connected prospects have no acceptance date`,
      description:
        "Acceptance rate and follow-up timing depend on this date. Set it from your LinkedIn invitation history.",
      prospectIds: connectedNoDate.map((p) => p.id),
      prospectCount: connectedNoDate.length,
      fixLabel: "Filter to these",
      fixHref: "prospects?issue=connected-no-date",
    });
  }

  const requestNoDate = prospects.filter(
    (p) => p.status === "Request Sent" && !p.connectionRequestDate,
  );
  if (requestNoDate.length > 0) {
    push({
      key: "request-no-date",
      type: "status-date-mismatch",
      severity: "medium",
      title: `${requestNoDate.length} Request Sent prospects have no request date`,
      description:
        "Without the send date you cannot judge when to follow up or count acceptances.",
      prospectIds: requestNoDate.map((p) => p.id),
      prospectCount: requestNoDate.length,
      fixLabel: "Filter to these",
      fixHref: "prospects?issue=request-no-date",
    });
  }

  const followUpNoDate = prospects.filter(
    (p) => p.status === "Follow-Up" && !p.nextFollowUpDate && !p.lastContactDate,
  );
  if (followUpNoDate.length > 0) {
    push({
      key: "followup-no-date",
      type: "status-date-mismatch",
      severity: "low",
      title: `${followUpNoDate.length} prospects in Follow-Up status have no contact history`,
      description: "The follow-up queue cannot schedule these without dates.",
      prospectIds: followUpNoDate.map((p) => p.id),
      prospectCount: followUpNoDate.length,
      fixLabel: "Filter to these",
      fixHref: "prospects?issue=followup-no-date",
    });
  }

  const convertedNoActivity = convertedProspects.filter(
    (p) => !meetingActivityIds.has(p.id),
  );
  if (convertedNoActivity.length > 0) {
    push({
      key: "converted-no-activity",
      type: "status-date-mismatch",
      severity: "medium",
      title: `${convertedNoActivity.length} Converted prospects have no meeting or reply activity`,
      description:
        "Conversions should be backed by an auditable event. Log the meeting or reply that closed it.",
      prospectIds: convertedNoActivity.map((p) => p.id),
      prospectCount: convertedNoActivity.length,
      fixLabel: "Filter to these",
      fixHref: "prospects?issue=converted-no-activity",
    });
  }

  // --- Impossible date orders ---------------------------------------------------
  const impossibleDates: typeof prospects = [];
  for (const p of prospects) {
    const req = p.connectionRequestDate;
    const acc = p.connectionAcceptedDate;
    const first = p.firstMessageDate;
    const last = p.lastContactDate;
    if (req && acc && acc < req) impossibleDates.push(p);
    else if (first && last && last < first) impossibleDates.push(p);
    else if (first && req && startOfDay(first) < addDays(startOfDay(req), -7)) {
      // messaging a week before the request — import error or InMail; suspicious
      impossibleDates.push(p);
    }
  }
  if (impossibleDates.length > 0) {
    push({
      key: "impossible-dates",
      type: "impossible-dates",
      severity: "high",
      title: `${impossibleDates.length} prospects have impossible date orders`,
      description:
        "E.g. accepted before the request was sent, or last contact before the first message. Usually an import mapping error.",
      prospectIds: impossibleDates.map((p) => p.id),
      prospectCount: impossibleDates.length,
      fixLabel: "Filter to these",
      fixHref: "prospects?issue=impossible-dates",
    });
  }

  const severityOrder: Record<IssueSeverity, number> = { high: 0, medium: 1, low: 2 };
  issues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return {
    issues,
    dismissedCount: issues.filter((i) => i.dismissed).length,
    checkedProspects: prospects.length,
    checkedCompanies: companies.length,
    generatedAt: new Date().toISOString(),
  };
}

function isValidLi(url: string): boolean {
  const u = url.trim().toLowerCase();
  if (!/^https?:\/\/([\w-]+\.)?linkedin\.com\/(in|pub)\/[\w\-%.]+\/?$/i.test(u)) {
    return /^https?:\/\/([\w-]+\.)?linkedin\.com\/in\//i.test(u);
  }
  return true;
}
