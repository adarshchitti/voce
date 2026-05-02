import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getAuthenticatedUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { subscriptions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function getStripe(): Stripe {
  return new Stripe(process.env.STRIPE_SECRET_KEY!);
}

export async function POST() {
  try {
    const { userId, unauthorized } = await getAuthenticatedUser();
    if (unauthorized) return unauthorized;
    const stripe = getStripe();

    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const email = user?.email ?? undefined;

    const existingSub = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .limit(1);

    let stripeCustomerId: string;

    if (existingSub.length && existingSub[0].stripeCustomerId) {
      stripeCustomerId = existingSub[0].stripeCustomerId;
    } else {
      const customer = await stripe.customers.create({
        email,
        metadata: { userId },
      });
      stripeCustomerId = customer.id;

      await db
        .insert(subscriptions)
        .values({
          userId,
          stripeCustomerId,
          status: "incomplete",
        })
        .onConflictDoUpdate({
          target: subscriptions.userId,
          set: {
            stripeCustomerId,
            updatedAt: new Date(),
          },
        });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";

    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      payment_method_types: ["card"],
      line_items: [
        {
          price: process.env.STRIPE_PRICE_ID!,
          quantity: 1,
        },
      ],
      mode: "subscription",
      subscription_data: {
        trial_period_days: 14,
        metadata: { userId },
      },
      success_url: `${appUrl}/settings?billing=success`,
      cancel_url: `${appUrl}/settings?billing=canceled`,
      allow_promotion_codes: true,
      metadata: { userId },
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Checkout error:", error);
    return Response.json({ error: "Failed to create checkout session" }, { status: 400 });
  }
}
