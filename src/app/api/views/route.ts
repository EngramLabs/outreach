import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { savedViewSchema, zodErrorMessage } from "@/lib/validation";

export async function GET(req: NextRequest) {
  const guard = await requireSession(req);
  if ("response" in guard) return guard.response;

  const views = await db.savedView.findMany({
    where: { entityType: "prospect" },
    orderBy: { createdAt: "asc" },
  });
  return Response.json({
    data: views.map((v) => ({
      id: v.id,
      name: v.name,
      entityType: v.entityType,
      filters: JSON.parse(v.filtersJson),
      createdAt: v.createdAt.toISOString(),
    })),
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
  const parsed = savedViewSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });
  }

  const existing = await db.savedView.findFirst({
    where: { entityType: "prospect", name: parsed.data.name },
  });
  if (existing) {
    // Save = update the filter set under the same name (predictable behavior).
    const updated = await db.savedView.update({
      where: { id: existing.id },
      data: { filtersJson: JSON.stringify(parsed.data.filters ?? {}) },
    });
    return Response.json({ id: updated.id, name: updated.name, updated: true });
  }

  const created = await db.savedView.create({
    data: {
      name: parsed.data.name,
      entityType: "prospect",
      filtersJson: JSON.stringify(parsed.data.filters ?? {}),
    },
  });
  return Response.json({ id: created.id, name: created.name }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const guard = await requireSession(req);
  if ("response" in guard) return guard.response;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return Response.json({ error: "Which view should be deleted?" }, { status: 400 });

  const existing = await db.savedView.findUnique({ where: { id } });
  if (!existing) return Response.json({ error: "Saved view not found." }, { status: 404 });

  await db.savedView.delete({ where: { id } });
  return Response.json({ ok: true });
}
