import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { companyCreateSchema, zodErrorMessage } from "@/lib/validation";
import { normalizeCompanyName, isValidUrl } from "@/lib/normalize";
import type { Prisma } from "@prisma/client";
import type { CompanyRow } from "@/lib/types";

export async function GET(req: NextRequest) {
  const guard = await requireSession(req);
  if ("response" in guard) return guard.response;

  const sp = req.nextUrl.searchParams;
  const query = sp.get("query")?.trim() ?? "";
  const status = sp.get("status") ?? "Active";
  const ids = sp.get("ids");
  const sort = sp.get("sort") ?? "name";
  const order = sp.get("order") === "desc" ? "desc" : "asc";

  const where: Record<string, unknown> = {};
  const and: Record<string, unknown>[] = [];
  if (status === "Active") where.status = "Active";
  else if (status === "Archived") where.status = "Archived";
  if (query) {
    and.push({
      OR: [
        { name: { contains: query } },
        { industry: { contains: query } },
        { location: { contains: query } },
        { website: { contains: query } },
      ],
    });
  }
  if (ids) {
    const list = ids.split(",").map((s) => s.trim()).filter(Boolean);
    and.push({ id: { in: list } });
  }
  if (and.length) where.AND = and;

  const orderBy =
    sort === "prospects"
      ? { prospects: { _count: order } }
      : sort === "createdAt"
        ? { createdAt: order }
        : { name: order };

  const companies = await db.company.findMany({
    where,
    orderBy: orderBy as Prisma.CompanyOrderByWithRelationInput,
    include: { _count: { select: { prospects: true } } },
  });

  const rows: CompanyRow[] = companies.map((c) => ({
    id: c.id,
    name: c.name,
    website: c.website,
    linkedinUrl: c.linkedinUrl,
    industry: c.industry,
    location: c.location,
    companySize: c.companySize,
    source: c.source,
    status: c.status,
    notes: c.notes,
    tags: c.tags,
    prospectCount: c._count.prospects,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  }));

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
  const parsed = companyCreateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });
  }
  const data = parsed.data;

  if (data.website && !isValidUrl(data.website)) {
    return Response.json(
      { error: "Website must be a full URL, e.g. https://example.com" },
      { status: 400 },
    );
  }

  const norm = normalizeCompanyName(data.name);
  const existing = await db.company.findFirst({ where: { normalizedName: norm } });
  if (existing) {
    return Response.json(
      {
        error: `"${existing.name}" already covers this name (duplicates are merged by normalized name). Open that record instead.`,
      },
      { status: 409 },
    );
  }

  const created = await db.company.create({
    data: {
      name: data.name,
      normalizedName: norm,
      website: data.website,
      linkedinUrl: data.linkedinUrl,
      industry: data.industry,
      location: data.location,
      companySize: data.companySize,
      source: data.source,
      status: data.status ?? "Active",
      notes: data.notes,
      tags: data.tags,
    },
  });

  return Response.json(
    { id: created.id, name: created.name },
    { status: 201 },
  );
}
