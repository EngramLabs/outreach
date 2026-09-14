import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { applyVerification } from "@/lib/automation";
import { verificationSchema, zodErrorMessage } from "@/lib/validation";
import { VERIFIABLE_FIELDS } from "@/lib/constants";

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

  const parsed = verificationSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });
  }

  const prospect = await db.prospect.findUnique({ where: { id } });
  if (!prospect) {
    return Response.json({ error: "Prospect not found." }, { status: 404 });
  }

  const fields: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(parsed.data.fields)) {
    if ((VERIFIABLE_FIELDS as readonly string[]).includes(k)) fields[k] = v;
  }

  try {
    await db.$transaction(async (tx) => {
      await applyVerification(tx, prospect, fields, parsed.data.notes ?? undefined);
    });
    const updated = await db.prospect.findUniqueOrThrow({ where: { id } });
    return Response.json({
      ok: true,
      verificationStatus: updated.verificationStatus,
      verifiedFields: updated.verifiedFields,
    });
  } catch (e) {
    return Response.json(
      { error: "Could not save the verification. Nothing was written — try again." },
      { status: 500 },
    );
  }
}
