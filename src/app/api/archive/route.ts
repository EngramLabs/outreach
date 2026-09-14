import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { serializeProspectRow } from "@/lib/query-utils";

/** Archived prospects (spec: Archive section) with restore support via bulk. */
export async function GET(req: NextRequest) {
  const guard = await requireSession(req);
  if ("response" in guard) return guard.response;

  const page = Math.max(1, Number(req.nextUrl.searchParams.get("page")) || 1);
  const pageSize = 50;
  const query = req.nextUrl.searchParams.get("query")?.trim() ?? "";

  const where = {
    archivedAt: { not: null },
    ...(query
      ? {
          OR: [
            { firstName: { contains: query } },
            { lastName: { contains: query } },
            { company: { name: { contains: query } } },
          ],
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    db.prospect.count({ where }),
    db.prospect.findMany({
      where,
      include: { company: { select: { id: true, name: true } }, campaign: { select: { id: true, name: true } } },
      orderBy: { archivedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return Response.json({
    data: rows.map(serializeProspectRow),
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  });
}
