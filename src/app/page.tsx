import { getSessionUser } from "@/lib/auth";
import { LoginScreen } from "@/components/layout/login-screen";
import { AppShell } from "@/components/layout/app-shell";
import { Providers } from "@/components/providers";

export default async function Home() {
  const user = await getSessionUser();

  if (!user) {
    return <LoginScreen />;
  }

  return (
    <Providers>
      <AppShell userName={user.name || user.email} />
    </Providers>
  );
}
