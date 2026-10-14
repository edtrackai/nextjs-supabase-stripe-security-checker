import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { env } from "@/lib/env";
import { stripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/server";
import { entitlementItem, eventAction } from "@/lib/subscription";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  // Raw body is required for signature verification. Never parse JSON first.
  const body = await request.text();
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(body, signature, env().STRIPE_WEBHOOK_SECRET);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const db = createAdminClient();

  // Idempotency: record the event as pending; mark it completed only after processing succeeds.
  // A retried event that is still pending (earlier attempt failed or crashed) is processed again.
  // Safe here because every handler below is an idempotent upsert keyed on Stripe ids; with non-idempotent
  // work, claim the row atomically with a lease (locked_until) instead. Side effects need their own dedupe key.
  const { error: insertError } = await db
    .from("stripe_events").insert({ id: event.id, type: event.type, status: "pending" });
  if (insertError) {
    if (insertError.code !== "23505") return NextResponse.json({ error: "DB error" }, { status: 500 });
    const { data: seen, error: readError } = await db
      .from("stripe_events").select("status").eq("id", event.id).maybeSingle();
    if (readError) return NextResponse.json({ error: "DB error" }, { status: 500 });
    if (eventAction(seen?.status) === "skip") return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object;
        if (s.client_reference_id && typeof s.customer === "string") {
          const { error } = await db
            .from("customers").upsert({ user_id: s.client_reference_id, stripe_customer_id: s.customer });
          if (error) throw error;
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object;
        const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
        const { data: customer, error: lookupError } = await db
          .from("customers").select("user_id").eq("stripe_customer_id", customerId).maybeSingle();
        if (lookupError) throw lookupError;
        if (!customer) throw new Error(`No user for customer ${customerId}`); // 5xx: retry after checkout links it
        // Periods live on items (API 2025-03-31.basil+); items.data[0] is only safe for single-item subs.
        const item = entitlementItem(sub.items.data, [env().STRIPE_PRICE_ID]);
        const { error } = await db.from("subscriptions").upsert({
          id: sub.id,
          user_id: customer.user_id,
          status: sub.status,
          price_id: item?.price.id ?? null,
          current_period_end: item ? new Date(item.current_period_end * 1000).toISOString() : null,
        });
        if (error) throw error;
        break;
      }
    }

    const { error: doneError } = await db.from("stripe_events")
      .update({ status: "completed", processed_at: new Date().toISOString() }).eq("id", event.id);
    if (doneError) throw doneError;
  } catch (err) {
    // Leave the event pending and return 5xx so Stripe retries; the retry processes it again.
    console.error("stripe webhook failed", event.type, event.id, err);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
