import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireSession(req);
  if ("response" in guard) return guard.response;
  const { id } = await params;

  const existing = await db.activity.findUnique({ where: { id } });
  if (!existing) {
    return Response.json({ error: "Activity not found." }, { status: 404 });
  }

  await db.activity.delete({ where: { id } });
  return Response.json({ ok: true });
}
