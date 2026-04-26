import type { Metadata } from "next";
import "./globals.css";
import Nav from "@/components/Nav";
import TokenExpiryBanner from "@/components/TokenExpiryBanner";
import { ToastProvider } from "@/components/Toast";
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
    <html lang="en" className="h-full">
      <body className="h-full bg-slate-50 text-slate-900 antialiased">
        <ToastProvider>
          <Nav />
          {tokenExpired ? <TokenExpiryBanner /> : null}
          <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">{children}</main>
        </ToastProvider>
      </body>
    </html>
  );
}
