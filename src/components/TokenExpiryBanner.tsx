"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function TokenExpiryBanner() {
  const pathname = usePathname();
  if (pathname === "/login") return null;
  return (
    <div className="bg-red-600 px-4 py-2 text-sm text-white">
      LinkedIn connection expired - posts cannot be published.{" "}
      <Link href="/settings" className="font-semibold underline">
        Reconnect -&gt;
      </Link>
    </div>
  );
}
