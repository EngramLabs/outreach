// Cookie-session auth for a private single-operator app.
// Deliberately minimal: one account, HMAC-signed HttpOnly cookie, scrypt
// password hashes. No OAuth/roles/tenancy (spec §64 — do not overengineer).
// Rationale documented in SECURITY.md.

import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { db } from "./db";

const COOKIE_NAME = "os_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days — daily-use tool

function secret(): string {
  return (
    process.env.AUTH_SECRET ||
    "dev-only-secret-change-me-in-production-0183274655"
  );
}

// ---------------------------------------------------------------------------
// Password hashing (scrypt)
// ---------------------------------------------------------------------------

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return (
    candidate.length === expected.length &&
    timingSafeEqual(candidate, expected)
  );
}

// ---------------------------------------------------------------------------
// Session tokens: base64url(payload) + "." + hmac
// ---------------------------------------------------------------------------

interface SessionPayload {
  sub: string; // user id
  exp: number;
}

function sign(data: string): string {
  return createHmac("sha256", secret()).update(data).digest("base64url");
}

export function createSessionToken(userId: string): string {
  const payload: SessionPayload = {
    sub: userId,
    exp: Date.now() + SESSION_TTL_MS,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function verifySessionToken(token: string | undefined): SessionPayload | null {
  if (!token) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const expected = sign(body);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as SessionPayload;
    if (typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Reading sessions (server components + route handlers)
// ---------------------------------------------------------------------------

export async function getSessionUser(): Promise<{ id: string; email: string; name: string } | null> {
  const store = await cookies();
  const payload = verifySessionToken(store.get(COOKIE_NAME)?.value);
  if (!payload) return null;
  const user = await db.user.findUnique({ where: { id: payload.sub } });
  if (!user) return null;
  return { id: user.id, email: user.email, name: user.name };
}

/** Route-handler guard. Returns null when authenticated, else a 401 Response. */
export async function requireSession(
  req?: NextRequest,
): Promise<{ user: { id: string; email: string; name: string } } | { response: Response }> {
  let token: string | undefined;
  if (req) {
    token = req.cookies.get(COOKIE_NAME)?.value;
  } else {
    const store = await cookies();
    token = store.get(COOKIE_NAME)?.value;
  }
  const payload = verifySessionToken(token);
  if (!payload) {
    return {
      response: Response.json(
        { error: "Not authenticated. Sign in again to continue." },
        { status: 401 },
      ),
    };
  }
  const user = await db.user.findUnique({ where: { id: payload.sub } });
  if (!user) {
    return {
      response: Response.json(
        { error: "Session is no longer valid. Sign in again." },
        { status: 401 },
      ),
    };
  }
  return { user: { id: user.id, email: user.email, name: user.name } };
}

export const sessionCookieName = COOKIE_NAME;
export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_TTL_MS / 1000,
  secure: process.env.NODE_ENV === "production",
};
