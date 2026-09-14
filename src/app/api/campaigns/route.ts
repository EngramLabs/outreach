import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { campaignCreateSchema, zodErrorMessage } from "@/lib/validation";
import type { CampaignRow, CampaignStats } from "@/lib/types";

async function campaignStats(campaignId: string): Promise<CampaignStats> {
  const [totalProspects, typeCounts, converted] = await Promise.all([
    db.prospect.count({ where: { campaignId, archivedAt: null } }),
    db.activity.groupBy({
      by: ["activityType"],
      where: { campaignId },
      _count: { _all: true },
    }),
    db.prospect.count({ where: { campaignId, status: "Converted" } }),
  ]);

  const count = (type: string) =>
    typeCounts.find((t) => t.activityType === type)?._count._all ?? 0;

  const requestsSent = count("Connection Request");
  const accepted = count("Connection Accepted");
  const messagesSent = count("Message Sent") + count("Follow-Up Sent");
  const replies = count("Reply Received");
  const meetings = count("Meeting");

  return {
    totalProspects,
    requestsSent,
    accepted,
    acceptanceRate: requestsSent > 0 ? accepted / requestsSent : null,
    messagesSent,
    replies,
    replyRate: messagesSent > 0 ? replies / messagesSent : null,
    meetings,
    conversions: converted,
  };
}

export async function GET(req: NextRequest) {
  const guard = await requireSession(req);
  if ("response" in guard) return guard.response;

  const sp = req.nextUrl.searchParams;
  const status = sp.get("status") ?? "active-only";

  const where: Record<string, unknown> =
    status === "all" ? {} : { status: { not: "Archived" } };

  const campaigns = await db.campaign.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });

  const rows: CampaignRow[] = await Promise.all(
    campaigns.map(async (c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      targetAudience: c.targetAudience,
      status: c.status,
      startDate: c.startDate?.toISOString() ?? null,
      endDate: c.endDate?.toISOString() ?? null,
      notes: c.notes,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
      stats: await campaignStats(c.id),
    })),
  );

  return Response.json({ data: rows });
}

export async function POST(req: NextRequest) {
  const guard = await requireSession(req);
  if ("response" in guard) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Could not read the request." }, { status: 400 });
  }
  const parsed = campaignCreateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });
  }
  const data = parsed.data;

  const existing = await db.campaign.findFirst({ where: { name: data.name } });
  if (existing) {
    return Response.json(
      { error: `A campaign named "${existing.name}" already exists.` },
      { status: 409 },
    );
  }

  const created = await db.campaign.create({
    data: {
      name: data.name,
      description: data.description,
      targetAudience: data.targetAudience,
      status: data.status ?? "Draft",
      startDate: data.startDate ? new Date(data.startDate) : null,
      endDate: data.endDate ? new Date(data.endDate) : null,
      notes: data.notes,
    },
  });

  return Response.json({ id: created.id, name: created.name }, { status: 201 });
}
