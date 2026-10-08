import { db } from "@/lib/db";
import { subscriptions, userSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { isDemo } from "@/lib/demo/mode";
import { isBillingEnabled } from "@/lib/billing";

export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "incomplete"
  | "beta"
  | "none";

export type SubscriptionState = {
  status: SubscriptionStatus;
  canGenerate: boolean;
  canPublish: boolean;
  showPaymentBanner: boolean;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  betaAccessUntil: Date | null;
};

export async function getSubscriptionStatus(userId: string): Promise<SubscriptionState> {
  if (isDemo()) {
    return {
      status: "beta",
      canGenerate: true,
      canPublish: true,
      showPaymentBanner: false,
      trialEndsAt: null,
      currentPeriodEnd: null,
      betaAccessUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    };
  }

  // Billing disabled: every account gets full access and no Stripe row is read
  // or written. Reported as "beta" because that is the existing status for
  // "entitled without a subscription"; betaAccessUntil stays null since no
  // grant actually exists. Flipping the flag back restores normal gating with
  // no data migration, because nothing here mutates Stripe state.
  if (!isBillingEnabled()) {
    return {
      status: "beta",
      canGenerate: true,
      canPublish: true,
      showPaymentBanner: false,
      trialEndsAt: null,
      currentPeriodEnd: null,
      betaAccessUntil: null,
    };
  }

  // Beta-access bypass runs ahead of the Stripe lookup. Stripe state is left
  // untouched; if beta expires, callers fall through to whatever Stripe says.
  const [settingsRow] = await db
    .select({ betaAccessUntil: userSettings.betaAccessUntil })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);
  const betaAccessUntil = settingsRow?.betaAccessUntil ?? null;
  if (betaAccessUntil && betaAccessUntil.getTime() > Date.now()) {
    return {
      status: "beta",
      canGenerate: true,
      canPublish: true,
      showPaymentBanner: false,
      trialEndsAt: null,
      currentPeriodEnd: null,
      betaAccessUntil,
    };
  }

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
      betaAccessUntil,
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
    betaAccessUntil,
  };
}
