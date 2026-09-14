import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { campaignUpdateSchema, zodErrorMessage } from "@/lib/validation";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const guard = await requireSession(req);
  if ("response" in guard) return guard.response;
  const { id } = await params;

  const campaign = await db.campaign.findUnique({
    where: { id },
    include: {
      prospects: {
        where: { archivedAt: null },
        orderBy: { updatedAt: "desc" },
        include: { company: { select: { id: true, name: true } } },
      },
      activities: {
        orderBy: { occurredAt: "desc" },
        take: 20,
        include: {
          prospect: { select: { firstName: true, lastName: true } },
        },
      },
    },
  });
  if (!campaign) {
    return Response.json({ error: "Campaign not found. It may have been deleted." }, { status: 404 });
  }

  const typeCounts = await db.activity.groupBy({
    by: ["activityType"],
    where: { campaignId: id },
    _count: { _all: true },
  });
  const count = (type: string) =>
    typeCounts.find((t) => t.activityType === type)?._count._all ?? 0;

  const requestsSent = count("Connection Request");
  const accepted = count("Connection Accepted");
  const messagesSent = count("Message Sent") + count("Follow-Up Sent");
  const replies = count("Reply Received");
  const converted = campaign.prospects.filter((p) => p.status === "Converted").length;

  return Response.json({
    id: campaign.id,
    name: campaign.name,
    description: campaign.description,
    targetAudience: campaign.targetAudience,
    status: campaign.status,
    startDate: campaign.startDate?.toISOString() ?? null,
    endDate: campaign.endDate?.toISOString() ?? null,
    notes: campaign.notes,
    createdAt: campaign.createdAt.toISOString(),
    updatedAt: campaign.updatedAt.toISOString(),
    stats: {
      totalProspects: campaign.prospects.length,
      requestsSent,
      accepted,
      acceptanceRate: requestsSent > 0 ? accepted / requestsSent : null,
      messagesSent,
      replies,
      replyRate: messagesSent > 0 ? replies / messagesSent : null,
      meetings: count("Meeting"),
      conversions: converted,
    },
    prospects: campaign.prospects.map((p) => ({
      id: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      jobTitle: p.jobTitle,
      status: p.status,
      priority: p.priority,
      companyName: p.company?.name ?? null,
      lastContactDate: p.lastContactDate?.toISOString() ?? null,
      nextFollowUpDate: p.nextFollowUpDate?.toISOString() ?? null,
    })),
    recentActivities: campaign.activities.map((a) => ({
      id: a.id,
      activityType: a.activityType,
      occurredAt: a.occurredAt.toISOString(),
      prospectName: a.prospect
        ? `${a.prospect.firstName}${a.prospect.lastName ? " " + a.prospect.lastName : ""}`
        : null,
      notes: a.notes,
    })),
  });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const guard = await requireSession(req);
  if ("response" in guard) return guard.response;
  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Could not read the request." }, { status: 400 });
  }
  const parsed = campaignUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });
  }
  const data = parsed.data;

  const existing = await db.campaign.findUnique({ where: { id } });
  if (!existing) {
    return Response.json({ error: "Campaign not found." }, { status: 404 });
  }

  if (data.name && data.name !== existing.name) {
    const dupe = await db.campaign.findFirst({ where: { name: data.name, id: { not: id } } });
    if (dupe) {
      return Response.json(
        { error: `A campaign named "${dupe.name}" already exists.` },
        { status: 409 },
      );
    }
  }

  const updated = await db.campaign.update({
    where: { id },
    data: {
      ...data,
      startDate:
        data.startDate === null
          ? null
          : data.startDate
            ? new Date(data.startDate)
            : undefined,
      endDate:
        data.endDate === null
          ? null
          : data.endDate
            ? new Date(data.endDate)
            : undefined,
    },
  });

  return Response.json({ id: updated.id, name: updated.name });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const guard = await requireSession(req);
  if ("response" in guard) return guard.response;
  const { id } = await params;

  const prospectCount = await db.prospect.count({ where: { campaignId: id } });
  if (prospectCount > 0) {
    return Response.json(
      {
        error: `${prospectCount} prospects are assigned to this campaign. Move them to another campaign or archive them first.`,
        prospectCount,
      },
      { status: 409 },
    );
  }

  const existing = await db.campaign.findUnique({ where: { id }, select: { name: true } });
  if (!existing) {
    return Response.json({ error: "Campaign not found." }, { status: 404 });
  }

  await db.campaign.delete({ where: { id } });
  return Response.json({ ok: true });
}
