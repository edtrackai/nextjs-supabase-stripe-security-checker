import { stripe } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("no", { status: 401 });
  const { priceId } = await request.json();
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: "https://example.com/checkout/success",
  });
  return Response.json({ url: session.url });
}
