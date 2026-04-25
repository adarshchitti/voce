import type { Metadata } from "next";
import "./globals.css";
import Nav from "@/components/Nav";
import TokenExpiryBanner from "@/components/TokenExpiryBanner";
import { db } from "@/lib/db";
import { eq } from "drizzle-orm";
import { linkedinTokens } from "@/lib/db/schema";
import { OWNER_USER_ID } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Voce",
  description: "LinkedIn AI content agent",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  let tokenExpired = false;
  try {
    const token = await db.query.linkedinTokens.findFirst({ where: eq(linkedinTokens.userId, OWNER_USER_ID) });
    tokenExpired = token?.status === "expired";
  } catch {
    tokenExpired = false;
  }

  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 text-gray-900">
        {tokenExpired ? <TokenExpiryBanner /> : null}
        <Nav />
        <main className="mx-auto w-full max-w-5xl p-4 md:p-6">{children}</main>
      </body>
    </html>
  );
}
