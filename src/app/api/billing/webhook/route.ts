import { headers } from "next/headers";
import Stripe from "stripe";
import { db } from "@/lib/db";
import { subscriptions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

function getStripe(): Stripe {
  return new Stripe(process.env.STRIPE_SECRET_KEY!);
}

/** Stripe v22+ exposes billing period end on subscription items, not the subscription root. */
function subscriptionCurrentPeriodEnd(sub: Stripe.Subscription): Date | null {
  const fromItem = sub.items?.data?.[0]?.current_period_end;
  if (fromItem != null) return new Date(fromItem * 1000);
  const legacy = (sub as unknown as { current_period_end?: number }).current_period_end;
  if (legacy != null) return new Date(legacy * 1000);
  return null;
}

function subscriptionIdFromInvoice(invoice: Stripe.Invoice): string | null {
  const sub = (invoice as unknown as { subscription?: string | Stripe.Subscription | null }).subscription;
  if (typeof sub === "string") return sub;
  if (sub && typeof sub === "object" && "id" in sub) return sub.id;
  return null;
}

export async function POST(req: Request) {
  const stripe = getStripe();
  const body = await req.text();
  const headersList = await headers();
  const signature = headersList.get("stripe-signature");

  if (!signature) {
    return Response.json({ error: "No signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== "subscription") break;

        const stripeSubscription = (await stripe.subscriptions.retrieve(session.subscription as string, {
          expand: ["items.data"],
        })) as unknown as Stripe.Subscription;
        const userId =
          session.metadata?.userId ??
          (session.subscription as Stripe.Subscription | undefined)?.metadata?.userId ??
          stripeSubscription.metadata?.userId;
        if (!userId) {
          console.error("No userId in checkout session metadata");
          break;
        }

        await db
          .insert(subscriptions)
          .values({
            userId,
            stripeCustomerId: session.customer as string,
            stripeSubscriptionId: stripeSubscription.id,
            status: stripeSubscription.status,
            trialEndsAt: stripeSubscription.trial_end
              ? new Date(stripeSubscription.trial_end * 1000)
              : null,
            currentPeriodEnd: subscriptionCurrentPeriodEnd(stripeSubscription),
          })
          .onConflictDoUpdate({
            target: subscriptions.userId,
            set: {
              stripeCustomerId: session.customer as string,
              stripeSubscriptionId: stripeSubscription.id,
              status: stripeSubscription.status,
              trialEndsAt: stripeSubscription.trial_end
                ? new Date(stripeSubscription.trial_end * 1000)
                : null,
              currentPeriodEnd: subscriptionCurrentPeriodEnd(stripeSubscription),
              updatedAt: new Date(),
            },
          });
        break;
      }

      case "customer.subscription.updated": {
        const stripeSubscription = event.data.object as Stripe.Subscription;
        const userId = stripeSubscription.metadata?.userId;
        if (!userId) {
          console.error("No userId in subscription metadata");
          break;
        }

        await db
          .update(subscriptions)
          .set({
            status: stripeSubscription.status,
            trialEndsAt: stripeSubscription.trial_end
              ? new Date(stripeSubscription.trial_end * 1000)
              : null,
            currentPeriodEnd: subscriptionCurrentPeriodEnd(stripeSubscription),
            updatedAt: new Date(),
          })
          .where(eq(subscriptions.stripeSubscriptionId, stripeSubscription.id));
        break;
      }

      case "customer.subscription.deleted": {
        const stripeSubscription = event.data.object as Stripe.Subscription;
        await db
          .update(subscriptions)
          .set({ status: "canceled", updatedAt: new Date() })
          .where(eq(subscriptions.stripeSubscriptionId, stripeSubscription.id));
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = subscriptionIdFromInvoice(invoice);
        if (!subId) break;
        await db
          .update(subscriptions)
          .set({ status: "past_due", updatedAt: new Date() })
          .where(eq(subscriptions.stripeSubscriptionId, subId));
        break;
      }

      default:
        break;
    }

    return Response.json({ received: true });
  } catch (error) {
    console.error("Webhook handler error:", error);
    return Response.json({ error: "Webhook handler failed" }, { status: 500 });
  }
}
