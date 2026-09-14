import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { serializeProspectRow } from "@/lib/query-utils";

/**
 * Research queue (spec §17): prospects in pre-outreach states.
 * Status filter accepts: new | researching | verification | verified | rejected | ready
 * (mapped onto prospect statuses; "rejected" uses Not Interested + a research note).
 */
const RESEARCH_STATUSES = ["Researching", "Needs Verification", "Verified", "Ready"];

export async function GET(req: NextRequest) {
  const guard = await requireSession(req);
  if ("response" in guard) return guard.response;

  const sp = req.nextUrl.searchParams;
  const stage = sp.get("stage") ?? "all";

  let statuses: string[] = RESEARCH_STATUSES;
  switch (stage) {
    case "researching": statuses = ["Researching"]; break;
    case "verification": statuses = ["Needs Verification"]; break;
    case "verified": statuses = ["Verified", "Ready"]; break;
    case "ready": statuses = ["Ready"]; break;
    case "rejected": statuses = ["Not Interested"]; break;
    default: statuses = RESEARCH_STATUSES;
  }

  const prospects = await db.prospect.findMany({
    where: { status: { in: statuses }, archivedAt: null },
    include: { company: { select: { id: true, name: true } }, campaign: { select: { id: true, name: true } } },
    orderBy: [{ fitScore: "desc" }, { dateAdded: "desc" }],
    take: 200,
  });

  // Rejected stage needs research note context; only show recent rejections.
  const filtered =
    stage === "rejected"
      ? prospects.filter((p) => p.dateAdded > new Date(Date.now() - 1000 * 60 * 60 * 24 * 90))
      : prospects;

  return Response.json({
    data: filtered.map((p) => ({
      ...serializeProspectRow(p),
      researchNotes: p.researchNotes,
      outreachAngle: p.outreachAngle,
    })),
    counts: {
      total: filtered.length,
      missingLinkedin: filtered.filter((p) => !p.linkedinUrl).length,
      missingCompany: filtered.filter((p) => !p.companyId).length,
      unverified: filtered.filter((p) => !p.verifiedFields).length,
    },
  });
}
