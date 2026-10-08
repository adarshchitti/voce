"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // Full-bleed routes: no sidebar chrome. /signup belongs here too — the demo
  // path is landing -> Start free -> signup, and a sidebar mid-signup breaks it.
  const isAuthPage =
    pathname === "/" ||
    pathname === "/login" ||
    pathname === "/signup" ||
    pathname === "/onboarding" ||
    pathname === "/_design";

  if (isAuthPage) return <>{children}</>;

  return (
    <div className="flex min-h-screen bg-paper">
      <div className="hidden md:block">
        <Sidebar />
      </div>
      <main className="min-h-screen flex-1 overflow-y-auto bg-paper pb-20 md:pb-0 md:pl-62">
        <div className="mx-auto max-w-[1080px] px-4 pt-10 pb-16 md:px-10">{children}</div>
      </main>
      <Sidebar mobileOnly />
    </div>
  );
}

