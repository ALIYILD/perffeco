import type { Handler, HandlerEvent } from "@netlify/functions";
import Stripe from "stripe";
import { Resend } from "resend";
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

async function sendEmail(to: string, subject: string, html: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return;
  const resend = new Resend(key);
  try {
    await resend.emails.send({ from: "Perffeco <hello@perffeco.com>", to, subject, html });
  } catch {
    try {
      await resend.emails.send({ from: "Perffeco <onboarding@resend.dev>", to, subject, html });
    } catch (e) {
      console.error("Email send failed:", e);
    }
  }
}

async function getUserEmail(db: ReturnType<typeof getDb>, customerId: string): Promise<{ userId: string; email: string } | null> {
  const { data } = await db
    .from("profiles")
    .select("id, email")
    .eq("stripe_customer_id", customerId)
    .limit(1);
  if (!data?.length) return null;
  return { userId: data[0].id, email: data[0].email };
}

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

        // Send cancellation email
        const cancelUser = await getUserEmail(db, customerId);
        if (cancelUser?.email) {
          await sendEmail(cancelUser.email, "Your Perffeco subscription has been cancelled",
            `<div style="max-width:600px;margin:0 auto;background:#000;color:#E8E8E8;font-family:Arial,sans-serif;padding:32px">
              <div style="font-size:24px;font-weight:800;color:#FF8200;margin-bottom:24px">Perffeco</div>
              <h2 style="margin:0 0 16px">We're sorry to see you go</h2>
              <p style="color:#B0B8C4;line-height:1.7">Your Perffeco subscription has been cancelled. You've been moved to the Free plan.</p>
              <p style="color:#B0B8C4;line-height:1.7">You still have access to the free dashboard, benchmarks, and basic pricing data.</p>
              <p style="color:#B0B8C4;line-height:1.7">Changed your mind? You can resubscribe anytime:</p>
              <div style="text-align:center;margin:24px 0">
                <a href="https://perffeco.com/#pricing" style="display:inline-block;background:#FF8200;color:#000;padding:14px 32px;border-radius:6px;font-weight:800;font-size:15px;text-decoration:none">Resubscribe to Pro</a>
              </div>
              <p style="color:#556677;font-size:12px;margin-top:32px">If you have feedback on how we can improve, reply to this email — we read every message.</p>
            </div>`);
        }

        console.log(`Customer ${customerId} downgraded to free`);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = stripeEvent.data.object as Stripe.Invoice;
        const failedCustomerId =
          typeof invoice.customer === "string"
            ? invoice.customer
            : invoice.customer?.id;

        if (!failedCustomerId) break;

        const failedUser = await getUserEmail(db, failedCustomerId);
        if (failedUser?.email) {
          await sendEmail(failedUser.email, "Action required: your Perffeco payment failed",
            `<div style="max-width:600px;margin:0 auto;background:#000;color:#E8E8E8;font-family:Arial,sans-serif;padding:32px">
              <div style="font-size:24px;font-weight:800;color:#FF8200;margin-bottom:24px">Perffeco</div>
              <h2 style="margin:0 0 16px">Your payment didn't go through</h2>
              <p style="color:#B0B8C4;line-height:1.7">We tried to charge your card for your Perffeco subscription, but the payment failed. Your access will remain active while we retry.</p>
              <p style="color:#B0B8C4;line-height:1.7">Please update your payment method to avoid losing access to Pro features:</p>
              <div style="text-align:center;margin:24px 0">
                <a href="https://billing.stripe.com/p/login/9AQbMz5dA2oDbQI4gg" style="display:inline-block;background:#FF8200;color:#000;padding:14px 32px;border-radius:6px;font-weight:800;font-size:15px;text-decoration:none">Update Payment Method</a>
              </div>
              <p style="color:#556677;font-size:12px;margin-top:32px">We'll retry the payment in a few days. If you need help, reply to this email.</p>
            </div>`);
        }

        console.log(`Payment failed for customer ${failedCustomerId}`);
        break;
      }

      case "customer.subscription.updated": {
        const updatedSub = stripeEvent.data.object as Stripe.Subscription;
        const updatedCustomerId =
          typeof updatedSub.customer === "string"
            ? updatedSub.customer
            : updatedSub.customer.id;

        const priceId = updatedSub.items.data[0]?.price?.id;
        if (!priceId) break;

        const newPlan = PRICE_TO_PLAN[priceId];
        if (!newPlan) break;

        const updatedUser = await getUserEmail(db, updatedCustomerId);
        if (updatedUser) {
          await db
            .from("profiles")
            .update({ plan: newPlan })
            .eq("id", updatedUser.userId);
          console.log(`Subscription updated: customer ${updatedCustomerId} → ${newPlan}`);
        }
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
