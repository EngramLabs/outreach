import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { applyFollowUpAction } from "@/lib/automation";
import { followUpActionSchema, zodErrorMessage } from "@/lib/validation";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireSession(req);
  if ("response" in guard) return guard.response;
  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Could not read the request." }, { status: 400 });
  }

  const parsed = followUpActionSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });
  }
  const data = parsed.data;

  const prospect = await db.prospect.findUnique({ where: { id } });
  if (!prospect) {
    return Response.json({ error: "Prospect not found." }, { status: 404 });
  }

  let date: Date | undefined;
  if (data.date) {
    date = new Date(data.date);
    if (isNaN(date.getTime())) {
      return Response.json({ error: "The follow-up date is not a valid date." }, { status: 400 });
    }
  }
  if ((data.action === "reschedule" || data.action === "completeAndReschedule") && !date) {
    return Response.json(
      { error: "Pick a date for the next follow-up before saving." },
      { status: 400 },
    );
  }

  try {
    const effects = await db.$transaction(async (tx) => {
      return applyFollowUpAction(tx, prospect, {
        action: data.action,
        date,
        notes: data.notes ?? undefined,
      });
    });
    return Response.json({ ok: true, effects });
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown error";
    return Response.json({ error: `Could not update the follow-up: ${message}` }, { status: 400 });
  }
}
