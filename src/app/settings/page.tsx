import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth";
import { getSubscriptionStatus } from "@/lib/subscription";
import SettingsClient from "./settings-client";

export default async function SettingsPage() {
  const { userId, unauthorized } = await getAuthenticatedUser();
  if (!userId || unauthorized) {
    redirect("/login");
  }
  const sub = await getSubscriptionStatus(userId);
  return (
    <SettingsClient
      subscription={{
        status: sub.status,
        trialEndsAt: sub.trialEndsAt?.toISOString() ?? null,
        currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
      }}
    />
  );
}
