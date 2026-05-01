"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isAuthPage = pathname === "/login" || pathname === "/onboarding";

  if (isAuthPage) return <>{children}</>;

  return (
    <div className="flex min-h-screen bg-[#F7F7F7]">
      <div className="hidden md:block">
        <Sidebar />
      </div>
      <main className="min-h-screen flex-1 overflow-y-auto bg-[#F7F7F7] pb-20 md:pb-0 md:pl-60">
        <div className="mx-auto max-w-6xl px-6 py-6">{children}</div>
      </main>
      <Sidebar mobileOnly />
    </div>
  );
}

