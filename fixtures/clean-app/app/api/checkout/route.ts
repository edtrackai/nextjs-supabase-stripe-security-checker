import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { stripe } from "@/lib/stripe";
import { createUserClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createUserClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  // Note: a browser form post from a signed-out user gets 401 JSON; the UI only shows the button when signed in.

  const e = env();
  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: e.STRIPE_PRICE_ID, quantity: 1 }],
    client_reference_id: user.id, // links the Stripe customer back to the Supabase user
    customer_email: user.email ?? undefined,
    success_url: `${e.NEXT_PUBLIC_SITE_URL}/account?checkout=success`,
    cancel_url: `${e.NEXT_PUBLIC_SITE_URL}/?checkout=cancelled`,
  });

  return NextResponse.redirect(session.url!, 303);
}
