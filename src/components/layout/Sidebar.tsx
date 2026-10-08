"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Archive,
  BarChart2,
  Calendar,
  CheckCircle,
  FolderKanban,
  Inbox,
  Loader2,
  LogOut,
  PenLine,
  Plus,
  Settings,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/Toast";

type LinkedInStatus = "active" | "expired" | "not_connected";

function sectionLabel(label: string) {
  return <p className="eyebrow mb-1 mt-5 px-3 text-ink-3 first:mt-0">{label}</p>;
}

function isRouteActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function Sidebar({ mobileOnly = false }: { mobileOnly?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const { showToast } = useToast();
  const [pendingCount, setPendingCount] = useState(0);
  const [linkedinStatus, setLinkedinStatus] = useState<LinkedInStatus>("not_connected");
  const [newDraftLoading, setNewDraftLoading] = useState(false);

  useEffect(() => {
    fetch("/api/inbox/count")
      .then((r) => r.json())
      .then((d) => setPendingCount(d.pendingCount ?? 0))
      .catch(() => setPendingCount(0));

    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        const tokenStatus = d.linkedinToken?.status as string | undefined;
        if (!tokenStatus) setLinkedinStatus("not_connected");
        else if (tokenStatus === "active") setLinkedinStatus("active");
        else setLinkedinStatus("expired");
      })
      .catch(() => setLinkedinStatus("not_connected"));
  }, []);

  const linkedinFooter = useMemo(() => {
    return {
      tone:
        linkedinStatus === "active"
          ? ("sage" as const)
          : linkedinStatus === "expired"
            ? ("coral" as const)
            : ("neutral" as const),
      // Never configured reads as provisional, not broken.
      variant: (linkedinStatus === "not_connected" ? "dashed" : "solid") as "dashed" | "solid",
      label:
        linkedinStatus === "active"
          ? "LinkedIn · connected"
          : linkedinStatus === "expired"
            ? "LinkedIn · reconnect"
            : "LinkedIn · not connected",
    };
  }, [linkedinStatus]);

  async function handleNewDraft() {
    try {
      setNewDraftLoading(true);
      const res = await fetch("/api/drafts/generate-one", { method: "POST" });
      if (!res.ok) throw new Error("failed");
      router.push("/inbox");
      showToast("New draft added to inbox");
    } catch {
      showToast("Could not generate a draft right now", "error");
    } finally {
      setNewDraftLoading(false);
    }
  }

  // Every row carries a transparent 2px border so the active state's ink border
  // does not change the row height (same approach as tabs.tsx).
  const navItemClass = (active: boolean) =>
    cn(
      "h-10 w-full justify-start gap-3 rounded-[10px] border-2 border-transparent px-3 text-[14px] font-medium text-ink-2 hover:bg-paper-sunk hover:text-ink",
      active && "border-ink bg-p-blue text-ink shadow-nav hover:bg-p-blue"
    );
  const navIconClass = "h-5 w-5 shrink-0";

  const desktop = (
    <aside className="fixed left-0 top-0 z-30 hidden h-screen w-62 flex-col border-r-2 border-ink bg-paper md:flex">
      <div className="flex h-14 shrink-0 items-center border-b border-hairline px-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-[8px] border-2 border-ink bg-accent-solid text-[15px] font-bold text-white shadow-[2px_2px_0_var(--ink)]">V</div>
          <span className="text-[15px] font-semibold text-ink">Voce</span>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {sectionLabel("Create")}
        <Button className="mb-2 h-10 w-full gap-2.5 text-[14px]" onClick={handleNewDraft} disabled={newDraftLoading}>
          {newDraftLoading ? <Loader2 className={cn(navIconClass, "animate-spin")} /> : <PenLine className={navIconClass} />}
          New Draft
        </Button>
        <Button variant="ghost" className={navItemClass(isRouteActive(pathname, "/projects"))} onClick={() => router.push("/projects")}>
          <Plus className={navIconClass} />
          New Project
        </Button>

        {sectionLabel("Workspace")}
        <Button variant="ghost" className={navItemClass(isRouteActive(pathname, "/inbox"))} onClick={() => router.push("/inbox")}>
          <Inbox className={navIconClass} />
          Inbox
          {pendingCount > 0 ? <Chip tone="surface" size="sm" className="ml-auto px-2 tabular-nums">{pendingCount}</Chip> : null}
        </Button>
        <Button variant="ghost" className={navItemClass(isRouteActive(pathname, "/projects"))} onClick={() => router.push("/projects")}>
          <FolderKanban className={navIconClass} />
          Projects
        </Button>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  className={cn(navItemClass(false), "cursor-not-allowed text-ink-3 opacity-60 hover:bg-transparent hover:text-ink-3")}
                  disabled
                />
              }
            >
              <Calendar className={navIconClass} />
              Calendar
              <span className="eyebrow ml-auto text-ink-3">soon</span>
            </TooltipTrigger>
            <TooltipContent>Coming in a future update</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {sectionLabel("History")}
        <Button variant="ghost" className={navItemClass(isRouteActive(pathname, "/history"))} onClick={() => router.push("/history")}>
          <CheckCircle className={navIconClass} />
          Published
        </Button>
        <Button variant="ghost" className={navItemClass(isRouteActive(pathname, "/archive"))} onClick={() => router.push("/archive")}>
          <Archive className={navIconClass} />
          Archive
        </Button>

        {sectionLabel("Insights")}
        <Button variant="ghost" className={navItemClass(isRouteActive(pathname, "/insights"))} onClick={() => router.push("/insights")}>
          <BarChart2 className={navIconClass} />
          Analytics
        </Button>
      </nav>

      <div className="shrink-0 space-y-1 border-t border-hairline p-3">
        <Button variant="ghost" className={navItemClass(isRouteActive(pathname, "/settings"))} onClick={() => router.push("/settings")}>
          <Settings className={navIconClass} />
          Settings
        </Button>
        <form action="/api/auth/signout" method="POST">
          <button
            type="submit"
            className="flex h-10 w-full cursor-pointer items-center gap-3 rounded-[10px] border-2 border-transparent px-3 text-[14px] font-medium text-ink-3 transition-colors hover:bg-paper-sunk hover:text-ink"
          >
            <LogOut className={navIconClass} />
            Sign out
          </button>
        </form>
        <Button variant="ghost" className="mt-1 h-auto w-full justify-start rounded-full p-0 hover:bg-transparent" onClick={() => router.push("/settings")}>
          <Chip dot tone={linkedinFooter.tone} variant={linkedinFooter.variant} interactive>
            {linkedinFooter.label}
          </Chip>
        </Button>
      </div>
    </aside>
  );

  if (mobileOnly) {
    return (
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t-2 border-ink bg-paper md:hidden">
        <div className="flex h-16 items-center justify-around">
          <Link href="/inbox" className={cn("flex flex-col items-center gap-1 text-[11px] font-medium text-ink-3", isRouteActive(pathname, "/inbox") && "text-ink")}>
            <div className="relative">
              <Inbox className="h-4 w-4" />
              {pendingCount > 0 ? <Chip tone="surface" size="sm" className="absolute -right-4 -top-2.5 h-4 min-w-4 justify-center px-1 text-[10px] tabular-nums">{pendingCount}</Chip> : null}
            </div>
            Inbox
          </Link>
          <Link href="/projects" className={cn("flex flex-col items-center gap-1 text-[11px] font-medium text-ink-3", isRouteActive(pathname, "/projects") && "text-ink")}>
            <FolderKanban className="h-4 w-4" />
            Projects
          </Link>
          <Link href="/history" className={cn("flex flex-col items-center gap-1 text-[11px] font-medium text-ink-3", isRouteActive(pathname, "/history") && "text-ink")}>
            <CheckCircle className="h-4 w-4" />
            History
          </Link>
          <Link href="/insights" className={cn("flex flex-col items-center gap-1 text-[11px] font-medium text-ink-3", isRouteActive(pathname, "/insights") && "text-ink")}>
            <Sparkles className="h-4 w-4" />
            Insights
          </Link>
          <Link href="/settings" className={cn("flex flex-col items-center gap-1 text-[11px] font-medium text-ink-3", isRouteActive(pathname, "/settings") && "text-ink")}>
            <Settings className="h-4 w-4" />
            Settings
          </Link>
        </div>
      </nav>
    );
  }

  return mobileOnly ? null : desktop;
}

