import { getSessionUser } from "@/lib/auth";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return Response.json({ authenticated: false });
  return Response.json({
    authenticated: true,
    email: user.email,
    name: user.name,
  });
}
