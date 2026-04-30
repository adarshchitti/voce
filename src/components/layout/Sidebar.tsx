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
  PenLine,
  Plus,
  Settings,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/Toast";

type LinkedInStatus = "active" | "expired" | "not_connected";

function sectionLabel(label: string) {
  return <p className="px-3 py-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>;
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

  const desktop = (
    <div className="flex h-full flex-col px-2 py-3">
      <Link href="/inbox" className="mb-3 flex items-center gap-2 px-3 py-2">
        <div className="flex h-6 w-6 items-center justify-center rounded-md border bg-background text-xs font-semibold">V</div>
        <span className="text-sm font-semibold">Voce</span>
      </Link>
      <Separator className="mb-2" />

      {sectionLabel("Create")}
      <Button
        variant="ghost"
        className="h-9 w-full justify-start gap-2 px-3 font-normal"
        onClick={handleNewDraft}
        disabled={newDraftLoading}
      >
        {newDraftLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <PenLine className="h-4 w-4" />}
        New Draft
      </Button>
      <Button
        variant="ghost"
        className={cn("h-9 w-full justify-start gap-2 px-3 font-normal", isRouteActive(pathname, "/projects") && "bg-accent text-accent-foreground")}
        onClick={() => router.push("/projects")}
      >
        <Plus className="h-4 w-4" />
        New Project
      </Button>

      <Separator className="my-2" />
      {sectionLabel("Workspace")}
      <Button
        variant="ghost"
        className={cn("h-9 w-full justify-start gap-2 px-3 font-normal", isRouteActive(pathname, "/inbox") && "bg-accent text-accent-foreground")}
        onClick={() => router.push("/inbox")}
      >
        <Inbox className="h-4 w-4" />
        Inbox
        {pendingCount > 0 ? <Badge className="ml-auto h-5 px-1.5 text-xs">{pendingCount}</Badge> : null}
      </Button>
      <Button
        variant="ghost"
        className={cn("h-9 w-full justify-start gap-2 px-3 font-normal", isRouteActive(pathname, "/projects") && "bg-accent text-accent-foreground")}
        onClick={() => router.push("/projects")}
      >
        <FolderKanban className="h-4 w-4" />
        Projects
      </Button>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>
            <Button
              variant="ghost"
              className="h-9 w-full cursor-not-allowed justify-start gap-2 px-3 font-normal opacity-50"
              disabled
            >
              <Calendar className="h-4 w-4" />
              Calendar
              <span className="ml-auto text-xs text-muted-foreground">soon</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Coming in a future update</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <Separator className="my-2" />
      {sectionLabel("History")}
      <Button
        variant="ghost"
        className={cn("h-9 w-full justify-start gap-2 px-3 font-normal", isRouteActive(pathname, "/history") && "bg-accent text-accent-foreground")}
        onClick={() => router.push("/history")}
      >
        <CheckCircle className="h-4 w-4" />
        Published
      </Button>
      <Button
        variant="ghost"
        className={cn("h-9 w-full justify-start gap-2 px-3 font-normal", isRouteActive(pathname, "/archive") && "bg-accent text-accent-foreground")}
        onClick={() => router.push("/archive")}
      >
        <Archive className="h-4 w-4" />
        Archive
      </Button>

      <Separator className="my-2" />
      {sectionLabel("Insights")}
      <Button
        variant="ghost"
        className={cn("h-9 w-full justify-start gap-2 px-3 font-normal", isRouteActive(pathname, "/insights") && "bg-accent text-accent-foreground")}
        onClick={() => router.push("/insights")}
      >
        <BarChart2 className="h-4 w-4" />
        Analytics
      </Button>

      <div className="mt-auto">
        <Separator className="my-2" />
        <Button
          variant="ghost"
          className={cn("h-9 w-full justify-start gap-2 px-3 font-normal", isRouteActive(pathname, "/settings") && "bg-accent text-accent-foreground")}
          onClick={() => router.push("/settings")}
        >
          <Settings className="h-4 w-4" />
          Settings
        </Button>
        <button
          type="button"
          onClick={() => router.push("/settings")}
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
        >
          <span className={cn("h-2 w-2 rounded-full", linkedinFooter.dot)} />
          <span className="text-xs text-muted-foreground">{linkedinFooter.label}</span>
        </button>
      </div>
    </div>
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

