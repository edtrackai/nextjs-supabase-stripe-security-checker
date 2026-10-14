import { stripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
export async function POST(request: Request) {
  const body = await request.text();
  const sig = request.headers.get("stripe-signature")!;
  const event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  const admin = createAdminClient();
  const { error } = await admin.from("stripe_events").insert({ id: event.id, status: "pending" });
  if (error?.code === "23505") {
    const { data } = await admin.from("stripe_events").select("status").eq("id", event.id).maybeSingle();
    if (data?.status === "completed") return new Response("dup");
  } else if (error) return new Response("db", { status: 500 });
  try {
    if (event.type === "checkout.session.completed") await admin.from("subscriptions").upsert({ status: "active" });
    await admin.from("stripe_events").update({ status: "completed" }).eq("id", event.id);
  } catch {
    return new Response("retry", { status: 500 });
  }
  return new Response("ok");
}
