import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { TERMINAL_STATUSES } from "@/lib/constants";
import { addDays, daysBetween, endOfDay, startOfDay } from "@/lib/normalize";
import { serializeProspectRow } from "@/lib/query-utils";
import type { FollowUpItem } from "@/lib/types";

export async function GET(req: NextRequest) {
  const guard = await requireSession(req);
  if ("response" in guard) return guard.response;

  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const tomorrowEnd = endOfDay(addDays(now, 1));
  const weekEnd = endOfDay(addDays(now, 7));

  // The queue is derived: every non-terminal prospect with a next-follow-up
  // date (spec §16 — updates automatically from prospect data).
  const scheduled = await db.prospect.findMany({
    where: {
      nextFollowUpDate: { not: null },
      archivedAt: null,
      status: { notIn: TERMINAL_STATUSES },
    },
    include: { company: { select: { id: true, name: true } }, campaign: { select: { id: true, name: true } } },
    orderBy: { nextFollowUpDate: "asc" },
  });

  const items: FollowUpItem[] = scheduled.map((p) => {
    const due = p.nextFollowUpDate!;
    let section: FollowUpItem["section"];
    if (due < todayStart) section = "overdue";
    else if (due <= todayEnd) section = "today";
    else if (due <= tomorrowEnd) section = "tomorrow";
    else if (due <= weekEnd) section = "week";
    else section = "upcoming";

    const daysOverdue =
      section === "overdue" ? Math.max(1, daysBetween(todayStart, due)) : null;

    return { prospect: serializeProspectRow(p), daysOverdue, section };
  });

  // Prospects that are mid-outreach but have NO next date scheduled.
  const noDate = await db.prospect.findMany({
    where: {
      nextFollowUpDate: null,
      archivedAt: null,
      status: { in: ["Connected", "Messaged", "Follow-Up", "Replied"] },
    },
    include: { company: { select: { id: true, name: true } }, campaign: { select: { id: true, name: true } } },
    orderBy: { lastContactDate: "desc" },
    take: 30,
  });
  for (const p of noDate) {
    items.push({ prospect: serializeProspectRow(p), daysOverdue: null, section: "nodate" });
  }

  return Response.json({
    items,
    counts: {
      overdue: items.filter((i) => i.section === "overdue").length,
      today: items.filter((i) => i.section === "today").length,
      tomorrow: items.filter((i) => i.section === "tomorrow").length,
      week: items.filter((i) => i.section === "week").length,
      upcoming: items.filter((i) => i.section === "upcoming").length,
      nodate: items.filter((i) => i.section === "nodate").length,
    },
  });
}
