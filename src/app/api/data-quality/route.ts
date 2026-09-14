import { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth";
import { runQualityScan, setDismissedKeys, getDismissedKeys } from "@/lib/quality";

export async function GET(req: NextRequest) {
  const guard = await requireSession(req);
  if ("response" in guard) return guard.response;
  const summary = await runQualityScan();
  return Response.json(summary);
}

/** Dismiss / restore individual issues. */
export async function POST(req: NextRequest) {
  const guard = await requireSession(req);
  if ("response" in guard) return guard.response;

  let body: { action?: string; key?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Could not read the request." }, { status: 400 });
  }

  const dismissed = await getDismissedKeys();

  if (body.action === "dismiss" && body.key) {
    dismissed.add(body.key);
    await setDismissedKeys(dismissed);
    return Response.json({ ok: true, dismissedCount: dismissed.size });
  }
  if (body.action === "restore" && body.key) {
    dismissed.delete(body.key);
    await setDismissedKeys(dismissed);
    return Response.json({ ok: true, dismissedCount: dismissed.size });
  }
  if (body.action === "reset") {
    await setDismissedKeys(new Set());
    return Response.json({ ok: true, dismissedCount: 0 });
  }
  return Response.json({ error: "Unknown data-quality action." }, { status: 400 });
}
