"use client";

import { FormEvent, useState } from "react";
import { Voiceprint } from "@/components/Voiceprint";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignIn(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
    } else {
      window.location.href = "/inbox";
    }
    setLoading(false);
  }

  return (
    <div className="grid min-h-screen bg-paper md:grid-cols-2">
      {/* Colour block: decorative Voiceprint + headline */}
      <aside className="hidden flex-col justify-between border-r-2 border-ink bg-p-amber p-10 md:flex">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-[10px] border-2 border-ink bg-surface font-display text-[17px] font-extrabold text-ink">
            V
          </div>
          <span className="font-display text-[18px] font-bold text-ink">Voce</span>
        </div>

        <div className="flex flex-col items-start gap-8">
          <Voiceprint specificity={0.92} cadence={0.7} humanness={0.86} grounding={0.62} size={240} />
          <h2 className="display-2 max-w-md text-ink">Drafts that sound like you, not like a model.</h2>
        </div>

        <p className="eyebrow text-ink-2">Every draft is scanned. Every claim is sourced.</p>
      </aside>

      {/* Form */}
      <main className="flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5 md:hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded-[10px] border-2 border-ink bg-accent-solid font-display text-[17px] font-extrabold text-white shadow-[2px_2px_0_var(--ink)]">
              V
            </div>
            <span className="font-display text-[18px] font-bold text-ink">Voce</span>
          </div>

          <p className="eyebrow mb-2 text-ink-3">Welcome back</p>
          <h1 className="display-3 text-ink">Sign in to Voce</h1>
          <p className="mb-8 mt-2 text-[14px] text-ink-2">Enter your email and password to continue.</p>

          <form onSubmit={handleSignIn} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="login-email" className="eyebrow text-[12px] text-ink">
                Email address
              </Label>
              <Input
                id="login-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="login-password" className="eyebrow text-[12px] text-ink">
                Password
              </Label>
              <Input
                id="login-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
              />
            </div>

            {error && <p className="text-[13px] font-medium text-destructive">{error}</p>}

            <Button type="submit" size="lg" disabled={loading || !email || !password} className="w-full">
              {loading ? "Signing in..." : "Sign in"}
            </Button>
          </form>

          <div className="my-7 border-t-2 border-dashed border-ink/25" />

          <p className="text-center text-[13px] text-ink-2">
            Don&apos;t have an account?{" "}
            <a href="/signup" className="link-rule font-medium text-ink">
              Start your free trial →
            </a>
          </p>

          <p className="eyebrow mt-6 text-center text-ink-3">Access is by invitation only</p>
        </div>
      </main>
    </div>
  );
}
