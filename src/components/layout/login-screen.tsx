"use client";

// Sign-in screen for the private workspace. Quiet, no marketing.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authApi } from "@/lib/api-client";

export function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError("Enter your email and password to sign in.");
      return;
    }
    setSubmitting(true);
    try {
      await authApi.login(email.trim(), password);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed. Try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <main className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2.5">
          <span
            aria-hidden
            className="flex size-8 items-center justify-center rounded-md bg-primary font-mono text-[13px] font-bold text-primary-foreground"
          >
            O
          </span>
          <div>
            <p className="font-mono text-[15px] font-semibold tracking-tight text-foreground">
              OutreachOS
            </p>
            <p className="text-[12px] text-muted-foreground">Private outreach workspace</p>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-lg border bg-card p-5 shadow-xs"
          noValidate
        >
          <div className="space-y-1.5">
            <Label htmlFor="login-email">Email</Label>
            <Input
              id="login-email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              aria-invalid={Boolean(error)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="login-password">Password</Label>
            <Input
              id="login-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error ? (
            <p role="alert" className="rounded-sm bg-destructive/10 px-2.5 py-2 text-[12.5px] text-destructive">
              {error}
            </p>
          ) : null}

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Signing in…" : "Sign in"}
          </Button>

          <p className="rounded-sm bg-surface-subtle px-2.5 py-2 text-[11.5px] leading-relaxed text-muted-foreground">
            Demo workspace — <span className="font-num">operator@outreach.local</span> /{" "}
            <span className="font-num">outreach-2024</span>
          </p>
        </form>
      </main>
    </div>
  );
}
