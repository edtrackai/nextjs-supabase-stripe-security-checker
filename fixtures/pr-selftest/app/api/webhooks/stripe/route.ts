import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
export async function POST(request: Request) {
  const event = (await request.json()) as Stripe.Event;
  if (event.type === "checkout.session.completed") {
    await createAdminClient().from("subscriptions").upsert({ status: "active" });
  }
  return new Response("ok");
}
