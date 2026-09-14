import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { PIPELINE_ORDER } from "@/lib/constants";
import { addDays, endOfDay, startOfDay } from "@/lib/normalize";
import type { AnalyticsData } from "@/lib/types";

const RANGES: Record<string, { days: number; label: string }> = {
  "7d": { days: 7, label: "Last 7 days" },
  "30d": { days: 30, label: "Last 30 days" },
  "90d": { days: 90, label: "Last 90 days" },
  year: { days: 365, label: "This year" },
};

export async function GET(req: NextRequest) {
  const guard = await requireSession(req);
  if ("response" in guard) return guard.response;

  const sp = req.nextUrl.searchParams;
  const rangeKey = sp.get("range") ?? "30d";
  const fromParam = sp.get("from");
  const toParam = sp.get("to");

  let from: Date;
  let to: Date = endOfDay(new Date());
  let label: string;

  if (rangeKey === "custom" && fromParam && toParam) {
    from = startOfDay(new Date(fromParam));
    to = endOfDay(new Date(toParam));
    label = "Custom range";
    if (isNaN(from.getTime()) || isNaN(to.getTime()) || from > to) {
      return Response.json(
        { error: "The custom range is invalid — the start must be before the end." },
        { status: 400 },
      );
    }
  } else {
    const r = RANGES[rangeKey] ?? RANGES["30d"];
    from = startOfDay(addDays(new Date(), -r.days + 1));
    label = r.label;
  }

  const [
    totalProspects,
    statusCounts,
    byCampaign,
    byCompany,
    requestsSent,
    accepted,
    messagesSent,
    replies,
    followUpsSent,
    followUpReplies,
    meetings,
    conversions,
    activities,
    prospectsAdded,
  ] = await Promise.all([
    db.prospect.count({ where: { archivedAt: null } }),
    db.prospect.groupBy({ by: ["status"], where: { archivedAt: null }, _count: { _all: true } }),
    db.prospect.groupBy({
      by: ["campaignId"],
      where: { archivedAt: null, campaignId: { not: null } },
      _count: { _all: true },
    }),
    db.prospect.groupBy({
      by: ["companyId"],
      where: { archivedAt: null, companyId: { not: null } },
      _count: { _all: true },
    }),
    db.activity.count({ where: { activityType: "Connection Request", occurredAt: { gte: from, lte: to } } }),
    db.activity.count({ where: { activityType: "Connection Accepted", occurredAt: { gte: from, lte: to } } }),
    db.activity.count({
      where: { activityType: { in: ["Message Sent", "Follow-Up Sent"] }, occurredAt: { gte: from, lte: to } },
    }),
    db.activity.count({ where: { activityType: "Reply Received", occurredAt: { gte: from, lte: to } } }),
    db.activity.count({ where: { activityType: "Follow-Up Sent", occurredAt: { gte: from, lte: to } } }),
    db.activity.count({
      where: { activityType: "Reply Received", occurredAt: { gte: from, lte: to }, notes: { not: null } },
    }),
    db.activity.count({ where: { activityType: "Meeting", occurredAt: { gte: from, lte: to } } }),
    db.prospect.count({ where: { status: "Converted" } }),
    db.activity.findMany({
      where: { occurredAt: { gte: from, lte: to } },
      select: { occurredAt: true },
    }),
    db.prospect.findMany({
      where: { dateAdded: { gte: from, lte: to } },
      select: { dateAdded: true },
    }),
  ]);

  const campaignIds = byCampaign.map((c) => c.campaignId).filter(Boolean) as string[];
  const campaigns = campaignIds.length
    ? await db.campaign.findMany({ where: { id: { in: campaignIds } }, select: { id: true, name: true } })
    : [];
  const campaignName = new Map(campaigns.map((c) => [c.id, c.name]));

  const companyIds = byCompany.map((c) => c.companyId).filter(Boolean) as string[];
  const companies = companyIds.length
    ? await db.company.findMany({ where: { id: { in: companyIds } }, select: { id: true, name: true } })
    : [];
  const companyName = new Map(companies.map((c) => [c.id, c.name]));

  // Zero-filled daily series.
  const dayCount = Math.min(370, Math.max(1, Math.round((to.getTime() - from.getTime()) / 86400000) + 1));
  const activityMap = new Map<string, number>();
  for (const a of activities) {
    const key = startOfDay(a.occurredAt).toISOString().slice(0, 10);
    activityMap.set(key, (activityMap.get(key) ?? 0) + 1);
  }
  const addedMap = new Map<string, number>();
  for (const p of prospectsAdded) {
    const key = startOfDay(p.dateAdded).toISOString().slice(0, 10);
    addedMap.set(key, (addedMap.get(key) ?? 0) + 1);
  }
  const activityByDay: { date: string; count: number }[] = [];
  const prospectsAddedByDay: { date: string; count: number }[] = [];
  for (let i = dayCount - 1; i >= 0; i--) {
    const key = startOfDay(addDays(to, -i)).toISOString().slice(0, 10);
    activityByDay.push({ date: key, count: activityMap.get(key) ?? 0 });
    prospectsAddedByDay.push({ date: key, count: addedMap.get(key) ?? 0 });
  }

  const data: AnalyticsData = {
    range: { from: from.toISOString(), to: to.toISOString(), label },
    totals: {
      prospects: totalProspects,
      byStatus: PIPELINE_ORDER.concat(["Not Interested", "No Response"]).map((status) => ({
        status,
        count: statusCounts.find((s) => s.status === status)?._count._all ?? 0,
      })),
      byCampaign: byCampaign
        .map((c) => ({
          campaignId: c.campaignId!,
          name: campaignName.get(c.campaignId!) ?? "Unknown campaign",
          count: c._count._all,
        }))
        .sort((a, b) => b.count - a.count),
      byCompany: byCompany
        .map((c) => ({
          companyId: c.companyId!,
          name: companyName.get(c.companyId!) ?? "Unknown company",
          count: c._count._all,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 15),
    },
    outreach: {
      requestsSent,
      accepted,
      acceptanceRate: requestsSent > 0 ? accepted / requestsSent : null,
      messagesSent,
      replies,
      replyRate: messagesSent > 0 ? replies / messagesSent : null,
      followUpsSent,
      followUpResponseRate: followUpsSent > 0 ? Math.min(1, replies / followUpsSent) : null,
      meetings,
      conversions,
      conversionRate: totalProspects > 0 ? conversions / totalProspects : null,
    },
    series: { activityByDay, prospectsAddedByDay },
  };

  return Response.json(data);
}
