import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  createSessionToken,
  sessionCookieName,
  sessionCookieOptions,
  verifyPassword,
} from "@/lib/auth";

const attempts = new Map<string, { count: number; windowStart: number }>();

export async function POST(req: NextRequest) {
  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Could not read the sign-in request." }, { status: 400 });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";

  if (!email || !password) {
    return Response.json(
      { error: "Enter both your email and password to sign in." },
      { status: 400 },
    );
  }

  // Best-effort in-memory rate limit (private single-operator app).
  const now = Date.now();
  const prev = attempts.get(email);
  const count = !prev || now - prev.windowStart > 60_000 ? 1 : prev.count + 1;
  attempts.set(email, { count, windowStart: now });
  if (count > 8) {
    return Response.json(
      { error: "Too many sign-in attempts. Wait a minute and try again." },
      { status: 429 },
    );
  }

  const user = await db.user.findFirst({ where: { email } });
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return Response.json(
      { error: "Email or password is incorrect. Check both and try again." },
      { status: 401 },
    );
  }

  const res = Response.json({ ok: true, email: user.email, name: user.name });
  res.headers.append(
    "Set-Cookie",
    cookieHeader(sessionCookieName, createSessionToken(user.id), sessionCookieOptions),
  );
  return res;
}

function cookieHeader(
  name: string,
  value: string,
  opts: { httpOnly: boolean; sameSite: "lax"; path: string; maxAge: number; secure: boolean },
): string {
  const parts = [`${name}=${value}`, `Path=${opts.path}`, `Max-Age=${opts.maxAge}`, "HttpOnly", "SameSite=Lax"];
  if (opts.secure) parts.push("Secure");
  return parts.join("; ");
}
