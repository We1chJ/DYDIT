"use client";

import { useState } from "react";
import { Logo } from "@/components/logo";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    });

    if (error) {
      setError(error.message);
      setStatus("idle");
      return;
    }
    setStatus("sent");
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-6">
      <div className="w-full max-w-[320px]">
        <Logo className="size-9" animate />

        <h1 className="mt-6 text-[26px] font-semibold tracking-[-0.02em] text-foreground">
          Did you do it today?
        </h1>
        <p className="mt-1.5 text-[14px] text-muted-foreground">
          Sign in and find out.
        </p>

        {status === "sent" ? (
          <div className="mt-7 rounded-lg border border-border bg-muted/60 px-4 py-3.5">
            <p className="text-[14px] font-medium text-foreground">
              Check your email
            </p>
            <p className="mt-1 text-[13.5px] leading-relaxed text-muted-foreground">
              We sent a sign-in link to{" "}
              <span className="text-foreground">{email}</span>. Open it on this
              device and you&rsquo;re in.
            </p>
            <button
              type="button"
              onClick={() => setStatus("idle")}
              className="mt-3 text-[13px] text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground"
            >
              Use a different email
            </button>
          </div>
        ) : (
          <form onSubmit={sendLink} className="mt-7 space-y-2.5">
            <input
              type="email"
              required
              autoFocus
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-[14px] text-foreground transition-shadow placeholder:text-faint focus-visible:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <button
              type="submit"
              disabled={status === "sending"}
              className="h-9 w-full rounded-md bg-primary text-[14px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-55"
            >
              {status === "sending" ? "Sending…" : "Email me a sign-in link"}
            </button>
            {error ? (
              <p role="alert" className="pt-0.5 text-[13px] text-destructive">
                {error}
              </p>
            ) : null}
          </form>
        )}

        <p className="mt-6 text-[12.5px] leading-relaxed text-faint">
          No password. The link signs you in on whichever computer you open it.
        </p>
      </div>
    </main>
  );
}
