import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth";
import { getSubscriptionStatus } from "@/lib/subscription";
import { isDemo } from "@/lib/demo/mode";
import InboxClient from "./inbox-client";

export default async function InboxPage() {
  const { userId, unauthorized } = await getAuthenticatedUser();
  if (!userId || unauthorized) {
    redirect("/login");
  }
  const { showPaymentBanner } = await getSubscriptionStatus(userId);
  return <InboxClient showPaymentBanner={showPaymentBanner} demoMode={isDemo()} />;
}
