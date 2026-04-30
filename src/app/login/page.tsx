"use client";

import { FormEvent, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const allowPasswordAuth = useMemo(
    () => process.env.NEXT_PUBLIC_ALLOW_PASSWORD_AUTH === "true" || process.env.ALLOW_PASSWORD_AUTH === "true",
    []
  );

  async function handleMagicLink(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setError(error.message);
    } else {
      setSent(true);
    }
    setLoading(false);
  }

  async function handlePasswordSignIn(event: FormEvent) {
    event.preventDefault();
    setPasswordLoading(true);
    setPasswordError(null);
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (!response.ok) {
      setPasswordError("Invalid password");
      setPasswordLoading(false);
      return;
    }
    window.location.href = "/inbox";
  }

  if (sent) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F7F7F7] p-4">
        <div className="w-full max-w-sm rounded-xl border border-[#E5E7EB] bg-white p-8 text-center shadow-[0_1px_3px_0_rgb(0_0_0/0.07)]">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#F0FDF4]">
            <svg className="h-5 w-5 text-[#16A34A]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h15A1.5 1.5 0 0 1 21 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 16.5v-9Z" />
              <path d="m4 7 8 6 8-6" />
            </svg>
          </div>
          <h2 className="mb-1 text-[17px] font-semibold text-[#111827]">Check your email</h2>
          <p className="text-[13px] text-[#6B7280]">
            We sent a magic link to <span className="font-medium text-[#111827]">{email}</span>. Click the link to sign in.
          </p>
          <button onClick={() => setSent(false)} className="mt-4 text-[12px] text-[#6B7280] underline hover:text-[#374151]">
            Use a different email
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F7F7F7] p-4">
      <div className="w-full max-w-sm rounded-xl border border-[#E5E7EB] bg-white p-8 shadow-[0_1px_3px_0_rgb(0_0_0/0.07)]">
        <div className="mb-6 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#2563EB] text-[15px] font-bold text-white">V</div>
          <span className="text-[16px] font-semibold text-[#111827]">Voce</span>
        </div>

        <h1 className="mb-1 text-[20px] font-semibold text-[#111827]">Sign in to Voce</h1>
        <p className="mb-6 text-[13px] text-[#6B7280]">Enter your email to receive a magic link</p>

        <form onSubmit={handleMagicLink} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[13px] font-medium text-[#374151]">Email address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
              className="h-9 w-full rounded-md border border-[#E5E7EB] px-3 text-[13.5px] text-[#111827] placeholder:text-[#9CA3AF] transition-colors focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
            />
          </div>

          {error && <p className="text-[12px] text-[#DC2626]">{error}</p>}

          <button
            type="submit"
            disabled={loading || !email}
            className="flex h-9 w-full items-center justify-center gap-2 rounded-md bg-[#2563EB] text-[13.5px] font-medium text-white transition-colors hover:bg-[#1D4ED8] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? (
              <>
                <span className="animate-spin">⟳</span> Sending...
              </>
            ) : (
              "Send magic link"
            )}
          </button>
        </form>

        {allowPasswordAuth ? (
          <div className="mt-6">
            <p className="text-center text-[12px] text-[#9CA3AF]">-- or --</p>
            {!showPassword ? (
              <button
                type="button"
                onClick={() => setShowPassword(true)}
                className="mt-4 h-9 w-full rounded-md border border-[#E5E7EB] bg-white text-[13.5px] font-medium text-[#374151] transition-colors hover:bg-[#F9FAFB]"
              >
                Sign in with password
              </button>
            ) : (
              <form onSubmit={handlePasswordSignIn} className="mt-4 space-y-3">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="Password"
                  className="h-9 w-full rounded-md border border-[#E5E7EB] px-3 text-[13.5px] text-[#111827] placeholder:text-[#9CA3AF] transition-colors focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
                />
                {passwordError ? <p className="text-[12px] text-[#DC2626]">{passwordError}</p> : null}
                <button
                  type="submit"
                  disabled={passwordLoading || !password}
                  className="flex h-9 w-full items-center justify-center rounded-md bg-[#111827] text-[13.5px] font-medium text-white transition-colors hover:bg-[#1F2937] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {passwordLoading ? "Signing in..." : "Continue"}
                </button>
              </form>
            )}
          </div>
        ) : null}

        <p className="mt-6 text-center text-[11px] text-[#9CA3AF]">Access is by invitation only</p>
      </div>
    </div>
  );
}
