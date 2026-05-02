import Stripe from "stripe";
import { getAuthenticatedUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { subscriptions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

function getStripe(): Stripe {
  return new Stripe(process.env.STRIPE_SECRET_KEY!);
}

export async function POST() {
  try {
    const { userId, unauthorized } = await getAuthenticatedUser();
    if (unauthorized) return unauthorized;
    const stripe = getStripe();

    const sub = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .limit(1);

    if (!sub.length || !sub[0].stripeCustomerId) {
      return Response.json({ error: "No subscription found" }, { status: 404 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";

    const session = await stripe.billingPortal.sessions.create({
      customer: sub[0].stripeCustomerId,
      return_url: `${appUrl}/settings`,
    });

    return Response.json({ url: session.url });
  } catch (error) {
    console.error("Portal error:", error);
    return Response.json({ error: "Failed to create portal session" }, { status: 400 });
  }
}
