"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (!response.ok) {
      setError("Invalid password");
      return;
    }
    router.push("/inbox");
  }

  return (
    <div className="grid min-h-[80vh] place-items-center">
      <form onSubmit={onSubmit} className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="mb-4 text-xl font-semibold">Sign in</h1>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full rounded-md border border-gray-300 px-3 py-2"
        />
        {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
        <button type="submit" className="mt-4 w-full rounded-md bg-gray-900 px-3 py-2 text-white">
          Continue
        </button>
      </form>
    </div>
  );
}
