"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function TokenExpiryBanner() {
  const pathname = usePathname();
  if (pathname === "/login") return null;
  return (
    <div className="border-b border-red-200 bg-red-50">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-2 sm:px-6">
        <p className="text-sm text-red-800">✕ LinkedIn disconnected — posts will not publish until reconnected</p>
        <Link href="/api/auth/linkedin" className="text-sm font-medium text-red-700 underline">
          Reconnect now
        </Link>
      </div>
    </div>
  );
}
