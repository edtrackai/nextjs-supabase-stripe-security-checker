import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { env } from "@/lib/env";
import { stripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/server";

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

  // Idempotency: Stripe retries, so record each event id once.
  const { error: dupError } = await db.from("stripe_events").insert({ id: event.id, type: event.type });
  if (dupError?.code === "23505") return NextResponse.json({ received: true, duplicate: true });
  if (dupError) return NextResponse.json({ error: "DB error" }, { status: 500 });

  switch (event.type) {
    case "checkout.session.completed": {
      const s = event.data.object;
      if (s.client_reference_id && typeof s.customer === "string") {
        await db.from("customers").upsert({ user_id: s.client_reference_id, stripe_customer_id: s.customer });
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object;
      const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
      const { data: customer } = await db
        .from("customers").select("user_id").eq("stripe_customer_id", customerId).maybeSingle();
      if (customer) {
        const periodEnd = sub.items.data[0]?.current_period_end;
        await db.from("subscriptions").upsert({
          id: sub.id,
          user_id: customer.user_id,
          status: sub.status,
          price_id: sub.items.data[0]?.price.id ?? null,
          current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
        });
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}
