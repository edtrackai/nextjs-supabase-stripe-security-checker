import Stripe from "stripe";
import { NextResponse } from "next/server";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// BAD: no constructEvent — trusts the JSON body
export async function POST(request: Request) {
  const event = await request.json();
  if (event.type === "checkout.session.completed") {
    // unlock access from forged payloads
  }
  return NextResponse.json({ received: true });
}
