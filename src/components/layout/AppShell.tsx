"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isAuthPage = pathname === "/login";

  if (isAuthPage) return <>{children}</>;

  return (
    <div className="flex h-screen bg-background">
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-background md:flex">
        <Sidebar />
      </aside>
      <main className="flex-1 overflow-y-auto pb-20 md:pb-0">{children}</main>
      <Sidebar mobileOnly />
    </div>
  );
}

