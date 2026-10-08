"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import type { AuthError } from "@supabase/supabase-js";
import { Voiceprint } from "@/components/Voiceprint";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

function mapSignUpError(error: AuthError): string {
  const msg = error.message.toLowerCase();
  if (
    msg.includes("already registered") ||
    msg.includes("already been registered") ||
    msg.includes("user already") ||
    msg.includes("email address is already") ||
    msg.includes("already exists")
  ) {
    return "An account with this email already exists. Sign in instead.";
  }
  if (
    msg.includes("password") &&
    (msg.includes("at least 6") || msg.includes("least 6") || msg.includes("6 characters") || msg.includes("too short"))
  ) {
    return "Password must be at least 6 characters.";
  }
  return "Something went wrong. Please try again.";
}

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);

  async function handleSignUp(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPendingMessage(null);

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (signUpError) {
        setError(mapSignUpError(signUpError));
        return;
      }

      if (data.session) {
        router.push("/onboarding");
        return;
      }

      if (data.user) {
        setPendingMessage("Check your inbox — we sent you a confirmation link.");
        return;
      }

      setError("Something went wrong. Please try again.");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
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
          <Voiceprint specificity={0.8} cadence={0.95} humanness={0.7} grounding={0.9} size={240} />
          <h2 className="display-2 max-w-md text-ink">Teach it your voice once. Post in it every day.</h2>
        </div>

        <p className="eyebrow text-ink-2">14-day free trial. No card required during setup.</p>
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

          <p className="eyebrow mb-2 text-ink-3">Get started</p>
          <h1 className="display-3 text-ink">Create your account</h1>
          <p className="mb-8 mt-2 text-[14px] text-ink-2">Start your 14-day free trial. No card required during setup.</p>

          <form onSubmit={handleSignUp} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="signup-email" className="eyebrow text-[12px] text-ink">
                Email
              </Label>
              <Input
                id="signup-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="signup-password" className="eyebrow text-[12px] text-ink">
                Password
              </Label>
              <div className="relative">
                <Input
                  id="signup-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="pr-10"
                  placeholder="At least 6 characters"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-ink-3 hover:text-ink"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error ? <p className="text-[13px] font-medium text-destructive">{error}</p> : null}
            {pendingMessage ? <p className="text-[13px] text-ink-2">{pendingMessage}</p> : null}

            <Button type="submit" size="lg" disabled={loading || !email || !password} className="w-full">
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {loading ? "Creating account..." : "Create account →"}
            </Button>
          </form>

          <div className="my-7 border-t-2 border-dashed border-ink/25" />

          <p className="text-center text-[13px] text-ink-2">
            Already have an account?{" "}
            <a href="/login" className="link-rule font-medium text-ink">
              Sign in →
            </a>
          </p>
        </div>
      </main>
    </div>
  );
}
