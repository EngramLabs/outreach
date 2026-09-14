import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { companyUpdateSchema, zodErrorMessage } from "@/lib/validation";
import { normalizeCompanyName, isValidUrl } from "@/lib/normalize";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const guard = await requireSession(req);
  if ("response" in guard) return guard.response;
  const { id } = await params;

  const company = await db.company.findUnique({
    where: { id },
    include: {
      prospects: {
        where: { archivedAt: null },
        orderBy: { updatedAt: "desc" },
        include: { campaign: { select: { id: true, name: true } } },
      },
      activities: {
        orderBy: { occurredAt: "desc" },
        take: 20,
        include: { prospect: { select: { firstName: true, lastName: true } } },
      },
    },
  });
  if (!company) {
    return Response.json({ error: "Company not found. It may have been deleted." }, { status: 404 });
  }

  const campaignIds = Array.from(
    new Set(
      company.prospects
        .map((p) => p.campaignId)
        .filter((c): c is string => c !== null),
    ),
  );
  const campaigns = campaignIds.length
    ? await db.campaign.findMany({ where: { id: { in: campaignIds } } })
    : [];

  return Response.json({
    id: company.id,
    name: company.name,
    website: company.website,
    linkedinUrl: company.linkedinUrl,
    industry: company.industry,
    location: company.location,
    companySize: company.companySize,
    source: company.source,
    status: company.status,
    notes: company.notes,
    tags: company.tags,
    createdAt: company.createdAt.toISOString(),
    updatedAt: company.updatedAt.toISOString(),
    prospectCount: company.prospects.length,
    prospects: company.prospects.map((p) => ({
      id: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      jobTitle: p.jobTitle,
      status: p.status,
      priority: p.priority,
      linkedinUrl: p.linkedinUrl,
      campaignId: p.campaignId,
      campaignName: p.campaign?.name ?? null,
      lastContactDate: p.lastContactDate?.toISOString() ?? null,
      nextFollowUpDate: p.nextFollowUpDate?.toISOString() ?? null,
    })),
    recentActivities: company.activities.map((a) => ({
      id: a.id,
      activityType: a.activityType,
      occurredAt: a.occurredAt.toISOString(),
      prospectName: a.prospect
        ? `${a.prospect.firstName}${a.prospect.lastName ? " " + a.prospect.lastName : ""}`
        : null,
      notes: a.notes,
    })),
    campaigns: campaigns.map((c) => ({
      id: c.id,
      name: c.name,
      status: c.status,
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
  const parsed = companyUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });
  }
  const data = parsed.data;

  const existing = await db.company.findUnique({ where: { id } });
  if (!existing) {
    return Response.json({ error: "Company not found." }, { status: 404 });
  }

  if (data.website && !isValidUrl(data.website)) {
    return Response.json(
      { error: "Website must be a full URL, e.g. https://example.com" },
      { status: 400 },
    );
  }

  if (data.name && data.name !== existing.name) {
    const norm = normalizeCompanyName(data.name);
    const dupe = await db.company.findFirst({
      where: { normalizedName: norm, id: { not: id } },
    });
    if (dupe) {
      return Response.json(
        { error: `"${dupe.name}" already normalizes to the same name — these are duplicates.` },
        { status: 409 },
      );
    }
  }

  const updated = await db.company.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name, normalizedName: normalizeCompanyName(data.name) } : {}),
      ...data,
    },
  });

  return Response.json({ id: updated.id, name: updated.name });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const guard = await requireSession(req);
  if ("response" in guard) return guard.response;
  const { id } = await params;

  const prospectCount = await db.prospect.count({ where: { companyId: id } });
  if (prospectCount > 0) {
    return Response.json(
      {
        error: `${prospectCount} prospects are attached to this company. Re-assign them before deleting — deleting would orphan their company context.`,
        prospectCount,
      },
      { status: 409 },
    );
  }

  const existing = await db.company.findUnique({ where: { id }, select: { name: true } });
  if (!existing) {
    return Response.json({ error: "Company not found." }, { status: 404 });
  }

  await db.company.delete({ where: { id } });
  return Response.json({ ok: true });
}
