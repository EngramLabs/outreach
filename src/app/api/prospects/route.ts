import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { listProspects, serializeProspectRow } from "@/lib/query-utils";
import { prospectCreateSchema, zodErrorMessage } from "@/lib/validation";
import { isValidEmail, isValidLinkedinUrl } from "@/lib/normalize";
import { applyStatusChange } from "@/lib/automation";
import { PROSPECT_STATUSES } from "@/lib/constants";
import type { ProspectsQuery } from "@/lib/types";

export async function GET(req: NextRequest) {
  const guard = await requireSession(req);
  if ("response" in guard) return guard.response;

  const sp = req.nextUrl.searchParams;
  const q: ProspectsQuery = {
    query: sp.get("query") ?? undefined,
    status: sp.get("status") ?? undefined,
    priority: sp.get("priority") ?? undefined,
    companyId: sp.get("companyId") ?? undefined,
    campaignId: sp.get("campaignId") ?? undefined,
    verification: sp.get("verification") ?? undefined,
    hasFollowUp: sp.get("hasFollowUp") ?? undefined,
    tag: sp.get("tag") ?? undefined,
    missing: sp.get("missing") ?? undefined,
    invalid: sp.get("invalid") ?? undefined,
    issue: sp.get("issue") ?? undefined,
    ids: sp.get("ids") ?? undefined,
    sort: sp.get("sort") ?? undefined,
    order: (sp.get("order") as "asc" | "desc") ?? undefined,
    page: Number(sp.get("page")) || 1,
    pageSize: Number(sp.get("pageSize")) || 50,
    archived: sp.get("archived") === "true",
  };

  const { rows, total } = await listProspects(q);
  const page = Math.max(1, q.page ?? 1);
  const pageSize = Math.min(200, Math.max(10, q.pageSize ?? 50));
  return Response.json({
    data: rows.map(serializeProspectRow),
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  });
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

  const parsed = prospectCreateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });
  }
  const data = parsed.data;

  // Duplicate identifier checks (spec §32: never trust client alone).
  if (data.linkedinUrl) {
    const existing = await db.prospect.findFirst({
      where: { linkedinUrl: data.linkedinUrl },
      select: { id: true, firstName: true, lastName: true },
    });
    if (existing) {
      return Response.json(
        {
          error: `LinkedIn URL is already attached to ${existing.firstName} ${existing.lastName ?? ""}. Merge or edit that record instead.`,
        },
        { status: 409 },
      );
    }
  }
  if (data.email) {
    const existing = await db.prospect.findFirst({
      where: { email: data.email },
      select: { id: true, firstName: true, lastName: true },
    });
    if (existing) {
      return Response.json(
        {
          error: `Email is already attached to ${existing.firstName} ${existing.lastName ?? ""}. Merge or edit that record instead.`,
        },
        { status: 409 },
      );
    }
  }

  try {
    const created = await db.$transaction(async (tx) => {
      // Company by name (dedupe on normalized name)
      let companyId = data.companyId ?? null;
      if (!companyId && data.companyName) {
        const norm = data.companyName
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, "")
          .replace(/\s+/g, " ")
          .trim();
        const existing = await tx.company.findFirst({ where: { normalizedName: norm } });
        companyId =
          existing?.id ??
          (
            await tx.company.create({
              data: {
                name: data.companyName,
                normalizedName: norm,
                source: data.source ?? null,
              },
            })
          ).id;
      }

      const prospect = await tx.prospect.create({
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
          status: "Researching", // always starts at the top; status set below via automation
          priority: data.priority,
          fitScore: data.fitScore,
          researchNotes: data.researchNotes,
          outreachAngle: data.outreachAngle,
          notes: data.notes,
          tags: data.tags,
        },
      });

      if (data.status && data.status !== "Researching") {
        await applyStatusChange(tx, prospect, data.status);
      }

      return tx.prospect.findUniqueOrThrow({
        where: { id: prospect.id },
        include: { company: { select: { id: true, name: true } }, campaign: { select: { id: true, name: true } } },
      });
    });

    return Response.json(serializeProspectRow(created), { status: 201 });
  } catch (e) {
    return Response.json(
      { error: "Could not save the prospect. Check your input and try again." },
      { status: 500 },
    );
  }
}
