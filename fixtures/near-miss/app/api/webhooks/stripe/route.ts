import { stripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
export async function POST(request: Request) {
  const body = await request.text();
  const sig = request.headers.get("stripe-signature")!;
  const event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  const admin = createAdminClient();
  const { error } = await admin.from("stripe_events").insert({ id: event.id });
  if (error) return new Response("dup");
  if (event.type === "checkout.session.completed") await admin.from("subscriptions").upsert({ status: "active" });
  return new Response("ok");
}
