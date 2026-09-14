import { sessionCookieName } from "@/lib/auth";

export async function POST() {
  const res = Response.json({ ok: true });
  res.headers.append(
    "Set-Cookie",
    `${sessionCookieName}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`,
  );
  return res;
}
