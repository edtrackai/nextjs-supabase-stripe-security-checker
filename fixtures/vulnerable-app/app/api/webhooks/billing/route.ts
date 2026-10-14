import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
export const runtime = "nodejs";

// S6: a duplicate is skipped even if the first attempt failed. S7: period from items.data[0].
export async function POST(request: Request) {
  const body = await request.text();
  const event = stripe.webhooks.constructEvent(body, request.headers.get("stripe-signature")!, process.env.STRIPE_WEBHOOK_SECRET!);
  const db = createAdminClient();
  const { error } = await db.from("stripe_events").insert({ id: event.id });
  if (error?.code === "23505") return NextResponse.json({ duplicate: true });
  if (event.type === "customer.subscription.updated") {
    const sub = event.data.object;
    const item = sub.items.data[0];
    await db.from("subscriptions").upsert({ id: sub.id, current_period_end: item.current_period_end });
  }
  return NextResponse.json({ received: true });
}
