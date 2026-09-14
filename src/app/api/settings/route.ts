import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { settingsSchema, zodErrorMessage } from "@/lib/validation";
import { DEFAULT_SETTINGS } from "@/lib/constants";

export async function GET(req: NextRequest) {
  const guard = await requireSession(req);
  if ("response" in guard) return guard.response;

  const rows = await db.setting.findMany();
  const map: Record<string, string> = { ...DEFAULT_SETTINGS };
  for (const r of rows) map[r.key] = r.value;

  const user = guard.user;
  return Response.json({ settings: map, operator: { email: user.email, name: user.name } });
}

export async function PATCH(req: NextRequest) {
  const guard = await requireSession(req);
  if ("response" in guard) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Could not read the request." }, { status: 400 });
  }
  const parsed = settingsSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });
  }

  for (const [key, value] of Object.entries(parsed.data)) {
    await db.setting.upsert({
      where: { key },
      update: { value: String(value) },
      create: { key, value: String(value) },
    });
  }
  return Response.json({ ok: true });
}
