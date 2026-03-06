import type { Handler, HandlerEvent } from "@netlify/functions";
import Stripe from "stripe";
import { getDb } from "./lib/supabase.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-02-25.clover",
});

// Map Stripe Price IDs → Perffeco plan names.
// Replace these placeholder IDs with actual Price IDs from your Stripe Dashboard
// (Products → each price → copy price_xxx ID).
const PRICE_TO_PLAN: Record<string, string> = {
  // Pro monthly ($29/mo)
  "price_1T7cCsIc3HQtwR9g7MWRzyjN": "pro",
  // Pro annual ($276/yr)
  "price_1T7cCtIc3HQtwR9gDbWk5Sm7": "pro",
  // Team monthly ($79/mo)
  "price_1T7cD3Ic3HQtwR9geAWFX6bp": "team",
  // Team annual ($756/yr)
  "price_1T7cD3Ic3HQtwR9gIpGjb9NJ": "team",
};

export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  const sig = event.headers["stripe-signature"];
  if (!sig) {
    return { statusCode: 400, body: "Missing stripe-signature header" };
  }

  let stripeEvent: Stripe.Event;
  try {
    stripeEvent = stripe.webhooks.constructEvent(
      event.body!,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("Webhook signature verification failed:", msg);
    return { statusCode: 400, body: `Webhook Error: ${msg}` };
  }

  const db = getDb();

  try {
    switch (stripeEvent.type) {
      case "checkout.session.completed": {
        const session = stripeEvent.data.object as Stripe.Checkout.Session;
        const userId = session.client_reference_id;
        if (!userId) {
          console.warn("checkout.session.completed without client_reference_id");
          break;
        }

        // Retrieve line items to get the Price ID
        const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 1 });
        const priceId = lineItems.data[0]?.price?.id;
        if (!priceId) {
          console.warn("No price ID found in line items for session", session.id);
          break;
        }

        const plan = PRICE_TO_PLAN[priceId];
        if (!plan) {
          console.warn("Unknown price ID:", priceId);
          break;
        }

        const { error } = await db
          .from("profiles")
          .update({
            plan,
            stripe_customer_id: session.customer as string,
          })
          .eq("id", userId);

        if (error) {
          console.error("Failed to update profile:", error.message);
          return { statusCode: 500, body: "DB update failed" };
        }

        // Cascade plan change to team if user is a team owner
        const { data: ownedTeam } = await db
          .from("teams")
          .select("id")
          .eq("owner_id", userId)
          .single();
        if (ownedTeam) {
          await db.from("teams").update({ plan, updated_at: new Date().toISOString() }).eq("id", ownedTeam.id);
          console.log(`Team ${ownedTeam.id} plan cascaded to ${plan}`);
        }

        console.log(`User ${userId} upgraded to ${plan}`);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = stripeEvent.data.object as Stripe.Subscription;
        const customerId =
          typeof subscription.customer === "string"
            ? subscription.customer
            : subscription.customer.id;

        const { data: profiles, error: lookupErr } = await db
          .from("profiles")
          .select("id")
          .eq("stripe_customer_id", customerId)
          .limit(1);

        if (lookupErr || !profiles?.length) {
          console.warn("No profile found for customer:", customerId);
          break;
        }

        const cancelUserId = profiles[0].id;
        const { error } = await db
          .from("profiles")
          .update({ plan: "free" })
          .eq("id", cancelUserId);

        if (error) {
          console.error("Failed to downgrade profile:", error.message);
          return { statusCode: 500, body: "DB update failed" };
        }

        // Cascade downgrade to team if user is a team owner
        const { data: cancelledTeam } = await db
          .from("teams")
          .select("id")
          .eq("owner_id", cancelUserId)
          .single();
        if (cancelledTeam) {
          await db.from("teams").update({ plan: "free", updated_at: new Date().toISOString() }).eq("id", cancelledTeam.id);
          console.log(`Team ${cancelledTeam.id} downgraded to free`);
        }

        console.log(`Customer ${customerId} downgraded to free`);
        break;
      }

      default:
        console.log("Unhandled event type:", stripeEvent.type);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("Webhook handler error:", msg);
    return { statusCode: 500, body: "Internal error" };
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};
