"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import type { AuthError } from "@supabase/supabase-js";
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
    <div className="min-h-screen bg-[#F7F7F7] px-6 py-6">
      <div className="mx-auto max-w-md">
        <div className="mb-8 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#2563EB] text-[15px] font-bold text-white">V</div>
          <span className="text-[16px] font-semibold text-[#111827]">Voce</span>
        </div>

        <div className="rounded-xl border border-[#E5E7EB] bg-white p-6 shadow-[0_1px_3px_0_rgb(0_0_0/0.07)]">
          <h1 className="text-[22px] font-semibold text-[#111827]">Create your account</h1>
          <p className="mt-1 text-[13.5px] text-[#6B7280]">Start your 14-day free trial. No card required during setup.</p>

          <form onSubmit={handleSignUp} className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="signup-email" className="text-[13px] font-medium text-[#374151]">
                Email
              </label>
              <input
                id="signup-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-9 w-full rounded-md border border-[#E5E7EB] px-3 text-[13px] text-[#111827] outline-none placeholder:text-[#9CA3AF] focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
                placeholder="you@example.com"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="signup-password" className="text-[13px] font-medium text-[#374151]">
                Password
              </label>
              <div className="relative">
                <input
                  id="signup-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="h-9 w-full rounded-md border border-[#E5E7EB] px-3 pr-10 text-[13px] text-[#111827] outline-none placeholder:text-[#9CA3AF] focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
                  placeholder="At least 6 characters"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-[#9CA3AF] hover:text-[#374151]"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error ? <p className="text-[12px] text-[#DC2626]">{error}</p> : null}
            {pendingMessage ? <p className="text-[13px] text-[#6B7280]">{pendingMessage}</p> : null}

            <button
              type="submit"
              disabled={loading || !email || !password}
              className="flex h-9 w-full items-center justify-center gap-2 rounded-md bg-[#2563EB] px-4 text-[13px] font-medium text-white hover:bg-[#1D4ED8] disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {loading ? "Creating account..." : "Create account →"}
            </button>
          </form>

          <div className="my-6 border-t border-[#E5E7EB]" />

          <p className="text-center text-[13px] text-[#6B7280]">
            Already have an account?{" "}
            <a href="/login" className="font-medium text-[#2563EB] hover:text-[#1D4ED8]">
              Sign in →
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
