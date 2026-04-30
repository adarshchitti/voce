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
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/Toast";

type LinkedInStatus = "active" | "expired" | "not_connected";

function sectionLabel(label: string) {
  return <p className="mb-1 mt-2 px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-[#9CA3AF]">{label}</p>;
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
      dot:
        linkedinStatus === "active"
          ? "bg-green-500"
          : linkedinStatus === "expired"
            ? "bg-red-500"
            : "bg-gray-400",
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

  const navItemClass = (active: boolean) =>
    cn(
      "h-auto w-full justify-start gap-2.5 rounded-md px-2.5 py-1.5 text-[13.5px] font-normal text-[#374151] hover:bg-[#F3F4F6] hover:text-[#111827]",
      active && "bg-[#EFF6FF] font-medium text-[#2563EB] hover:bg-[#EFF6FF] hover:text-[#2563EB]"
    );

  const desktop = (
    <aside className="fixed left-0 top-0 z-30 hidden h-screen w-60 flex-col border-r border-[#E5E7EB] bg-white md:flex">
      <div className="flex h-14 items-center border-b border-[#E5E7EB] px-4">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-brand text-sm font-bold text-white">V</div>
          <span className="text-[15px] font-semibold text-[#111827]">Voce</span>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {sectionLabel("Create")}
        <Button variant="ghost" className={navItemClass(false)} onClick={handleNewDraft} disabled={newDraftLoading}>
          {newDraftLoading ? <Loader2 className="h-[15px] w-[15px] animate-spin" /> : <PenLine className="h-[15px] w-[15px] text-[#6B7280]" />}
          New Draft
        </Button>
        <Button variant="ghost" className={navItemClass(isRouteActive(pathname, "/projects"))} onClick={() => router.push("/projects")}>
          <Plus className="h-[15px] w-[15px] text-[#6B7280]" />
          New Project
        </Button>

        {sectionLabel("Workspace")}
        <Button variant="ghost" className={navItemClass(isRouteActive(pathname, "/inbox"))} onClick={() => router.push("/inbox")}>
          <Inbox className="h-[15px] w-[15px] text-[#6B7280]" />
          Inbox
          {pendingCount > 0 ? <Badge className="ml-auto h-4 px-1.5 text-[11px]">{pendingCount}</Badge> : null}
        </Button>
        <Button variant="ghost" className={navItemClass(isRouteActive(pathname, "/projects"))} onClick={() => router.push("/projects")}>
          <FolderKanban className="h-[15px] w-[15px] text-[#6B7280]" />
          Projects
        </Button>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              <Button variant="ghost" className="h-auto w-full cursor-not-allowed justify-start gap-2.5 rounded-md px-2.5 py-1.5 text-[13.5px] font-normal text-[#6B7280] opacity-60" disabled>
                <Calendar className="h-[15px] w-[15px] text-[#6B7280]" />
                Calendar
                <span className="ml-auto text-[11px] text-[#9CA3AF]">soon</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Coming in a future update</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {sectionLabel("History")}
        <Button variant="ghost" className={navItemClass(isRouteActive(pathname, "/history"))} onClick={() => router.push("/history")}>
          <CheckCircle className="h-[15px] w-[15px] text-[#6B7280]" />
          Published
        </Button>
        <Button variant="ghost" className={navItemClass(isRouteActive(pathname, "/archive"))} onClick={() => router.push("/archive")}>
          <Archive className="h-[15px] w-[15px] text-[#6B7280]" />
          Archive
        </Button>

        {sectionLabel("Insights")}
        <Button variant="ghost" className={navItemClass(isRouteActive(pathname, "/insights"))} onClick={() => router.push("/insights")}>
          <BarChart2 className="h-[15px] w-[15px] text-[#6B7280]" />
          Analytics
        </Button>
      </nav>

      <div className="space-y-0.5 border-t border-[#E5E7EB] p-3">
        <Button variant="ghost" className={navItemClass(isRouteActive(pathname, "/settings"))} onClick={() => router.push("/settings")}>
          <Settings className="h-[15px] w-[15px] text-[#6B7280]" />
          Settings
        </Button>
        <form action="/api/auth/signout" method="POST">
          <button
            type="submit"
            className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13.5px] font-normal text-[#6B7280] transition-colors hover:bg-[#F3F4F6] hover:text-[#374151]"
          >
            <LogOut className="h-[15px] w-[15px]" />
            Sign out
          </button>
        </form>
        <Button variant="ghost" className="h-auto w-full justify-start gap-2.5 rounded-md px-2.5 py-1.5 text-[12px] font-normal text-[#6B7280] hover:bg-[#F3F4F6]" onClick={() => router.push("/settings")}>
          <span className={cn("h-2 w-2 rounded-full", linkedinFooter.dot)} />
          {linkedinFooter.label}
        </Button>
      </div>
    </aside>
  );

  if (mobileOnly) {
    return (
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background md:hidden">
        <div className="flex h-16 items-center justify-around">
          <Link href="/inbox" className={cn("flex flex-col items-center gap-1 text-xs", isRouteActive(pathname, "/inbox") && "text-foreground")}>
            <div className="relative">
              <Inbox className="h-4 w-4" />
              {pendingCount > 0 ? <Badge className="absolute -right-3 -top-2 h-4 px-1 text-[10px]">{pendingCount}</Badge> : null}
            </div>
            Inbox
          </Link>
          <Link href="/projects" className={cn("flex flex-col items-center gap-1 text-xs", isRouteActive(pathname, "/projects") && "text-foreground")}>
            <FolderKanban className="h-4 w-4" />
            Projects
          </Link>
          <Link href="/insights" className={cn("flex flex-col items-center gap-1 text-xs", isRouteActive(pathname, "/insights") && "text-foreground")}>
            <Sparkles className="h-4 w-4" />
            Insights
          </Link>
          <Link href="/settings" className={cn("flex flex-col items-center gap-1 text-xs", isRouteActive(pathname, "/settings") && "text-foreground")}>
            <Settings className="h-4 w-4" />
            Settings
          </Link>
        </div>
      </nav>
    );
  }

  return mobileOnly ? null : desktop;
}

