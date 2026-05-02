"use client";

import { FormEvent, useState } from "react";
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
    <div className="flex min-h-screen items-center justify-center bg-[#F7F7F7] p-4">
      <div className="w-full max-w-sm rounded-xl border border-[#E5E7EB] bg-white p-8 shadow-[0_1px_3px_0_rgb(0_0_0/0.07)]">
        <div className="mb-6 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#2563EB] text-[15px] font-bold text-white">V</div>
          <span className="text-[16px] font-semibold text-[#111827]">Voce</span>
        </div>

        <h1 className="mb-1 text-[20px] font-semibold text-[#111827]">Sign in to Voce</h1>
        <p className="mb-6 text-[13px] text-[#6B7280]">Enter your email and password to continue</p>

        <form onSubmit={handleSignIn} className="space-y-4">
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

          <div className="space-y-1.5">
            <label className="text-[13px] font-medium text-[#374151]">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              className="h-9 w-full rounded-md border border-[#E5E7EB] px-3 text-[13.5px] text-[#111827] placeholder:text-[#9CA3AF] transition-colors focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
            />
          </div>

          {error && <p className="text-[12px] text-[#DC2626]">{error}</p>}

          <button
            type="submit"
            disabled={loading || !email || !password}
            className="flex h-9 w-full items-center justify-center gap-2 rounded-md bg-[#2563EB] text-[13.5px] font-medium text-white transition-colors hover:bg-[#1D4ED8] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <div className="my-6 border-t border-[#E5E7EB]" />

        <p className="text-center text-[13px] text-[#6B7280]">
          Don&apos;t have an account?{" "}
          <a href="/signup" className="font-medium text-[#2563EB] hover:text-[#1D4ED8]">
            Start your free trial →
          </a>
        </p>

        <p className="mt-6 text-center text-[11px] text-[#9CA3AF]">Access is by invitation only</p>
      </div>
    </div>
  );
}
