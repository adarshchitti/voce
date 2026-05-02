import { db } from "@/lib/db";
import { subscriptions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "incomplete"
  | "none";

export async function getSubscriptionStatus(userId: string): Promise<{
  status: SubscriptionStatus;
  canGenerate: boolean;
  canPublish: boolean;
  showPaymentBanner: boolean;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
}> {
  const sub = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1);

  if (!sub.length) {
    return {
      status: "none",
      canGenerate: false,
      canPublish: false,
      showPaymentBanner: false,
      trialEndsAt: null,
      currentPeriodEnd: null,
    };
  }

  const s = sub[0];
  const raw = s.status;
  const status: SubscriptionStatus =
    raw === "trialing" ||
    raw === "active" ||
    raw === "past_due" ||
    raw === "canceled" ||
    raw === "incomplete"
      ? raw
      : "none";

  return {
    status,
    canGenerate: status === "trialing" || status === "active",
    canPublish: status === "trialing" || status === "active",
    showPaymentBanner: status === "past_due",
    trialEndsAt: s.trialEndsAt,
    currentPeriodEnd: s.currentPeriodEnd,
  };
}
